import PouchDB from 'pouchdb';
import md5 from 'blueimp-md5';
import cuid from 'cuid';
import { AbstractIteratorOptions, AbstractBatch } from 'abstract-leveldown';
import { LevelUp } from 'levelup';

import { reportError } from './errors';
import { dbNamespace, nested, base, rdfStore } from './leveldb';
import * as N3 from 'n3';
import * as models from '../../common/models';
import { unstringifyQuad } from '../../common/rdf';

const { DataFactory } = N3;
const { namedNode } = DataFactory;

export function getTopic(topicKey: string): Promise<models.Doc> {
  return dbNamespace('topics').get(hash(topicKey));
}

export async function pokeBear(topicId: string) {
  const shortId = topicId.slice(1);

  const tuples = await rdfStore.get({
    subject: namedNode('https://curzonj.github.io/brain/#' + shortId),
  });
  console.log(tuples);
}
export async function getNotes(topicId: string): Promise<string[]> {
  const notesLevelDB = nested(dbNamespace('notes'), topicId);
  const list = await getAll<models.Note>(notesLevelDB);

  // merely by returning the entire list here, unsaved notes
  // would gain the more link, but if you were to add a note
  // onto that unsaved note, the sync would break
  return list.map(n => n.text);
}

export async function addNote(topicId: string, text: string) {
  if (topicId === '/index') {
    topicId = '/inbox';
  }

  const lastSeq = await getLastSeq();
  const notesLevelDB = nested(dbNamespace('notes'), topicId);
  const id = cuid();
  const payload = {
    _id: `$/queue/${topicId}/${id}`,
    topic_id: topicId,
    seq: lastSeq,
    created_at: Date.now(),
    id: `/${id}`,
    text: text.trim(),
  } as models.NewNote;

  await notesLevelDB.put(id, payload);

  // async but we won't wait for it
  attemptNoteUpload(payload).catch(e =>
    reportError(e, {
      file: 'db',
      fn: 'attemptNoteUpload',
      at: 'catch',
    })
  );
}
export async function configure(value: string) {
  JSON.parse(value);
  localStorage.couchdb_target = value;

  await sync();
}

async function isConfigured(): Promise<boolean> {
  if (!navigator.onLine) {
    return true;
  }

  const config = getDbTarget();
  if (!config) {
    return false;
  }

  const remoteDb = getRemoteDb();

  try {
    // TODO once I have a better idea of what errors from
    // this can look like I'll delete the config and return
    // false sometimes
    await remoteDb.info();
  } catch (e) {
    reportError(e, {
      at: 'db.isConfigured',
    });
  }

  return true;
}

export async function uploadNotes(sourceDb: PouchDB.Database) {
  const notesLevelDB = dbNamespace('notes');
  const list = await getAll<models.Note>(notesLevelDB);

  await Promise.all(
    list.map(async note => {
      const docId = `$/queue/${note.topic_id}/${note.id}`;
      const doc = {
        _id: docId,
        ...note,
      } as models.NewNote;

      const existing = await sourceDb
        .get(docId)
        .catch(async (e: PouchDB.Core.Error) => {
          if (e.status !== 404) {
            reportError(e, {
              file: 'db',
              fn: 'uploadNotes',
              at: 'failure',
              noteId: docId,
            });

            return e;
          }

          if (e.reason === 'deleted') {
            // the translation between these IDs and couchdb is a
            // little broken so it's easier to just delete them from levelDB
            // when they are deleted from couchdb
            const topicNotes = nested(dbNamespace('notes'), doc.topic_id);
            await topicNotes.del(doc.id);

            return e;
          }

          return;
        });

      if (existing) {
        console.log({
          file: 'db',
          fn: 'uploadNotes',
          at: 'skip',
          doc,
          existing,
        });
      } else {
        await sourceDb.put(doc);
      }
    })
  );
}

export async function initialize(): Promise<boolean> {
  const ready = await isConfigured();
  if (!ready) {
    return false;
  }

  await sync();

  return true;
}

async function sync() {
  if (!navigator.onLine) {
    return;
  }

  const remoteDb = getRemoteDb();
  const localDb = getLocalDb();

  localDb.sync(remoteDb);

  await syncToLevelDB(localDb);
  await uploadNotes(localDb);
}

async function syncToLevelDB(sourceDb: PouchDB.Database) {
  const lastSeq = await getLastSeq();
  if (!lastSeq) {
    await importTuplesToQuadstore(sourceDb);
    await importTopicsToLevelDB(sourceDb);
  } else {
    await updateLevelDB(sourceDb, lastSeq);
  }
}

async function importTuplesToQuadstore(sourceDb: PouchDB.Database) {
  const { rows } = await sourceDb.allDocs<models.RdfDoc>({
    include_docs: true,
    startkey: `$/rdfHashes/`,
    endkey: `$/rdfHashes/\uFFF0`,
  });
  const quads = rows
    .map(row => row.doc)
    .filter(doc => doc !== undefined)
    .map(doc => unstringifyQuad(doc as models.RdfDoc));

  await rdfStore.put(quads);
}

async function importTopicsToLevelDB(sourceDb: PouchDB.Database) {
  const { rows, update_seq: resultSequence } = await sourceDb.allDocs<
    models.Doc
  >({
    include_docs: true,
    startkey: `$/topics/`,
    endkey: `$/topics/\uFFF0`,
    update_seq: true,
  });
  const ops = rows.flatMap(({ doc }) => {
    if (!doc) {
      return [];
    }

    return {
      type: 'put',
      key: `!topics!${lastSlashItem(doc._id)}`,
      value: stripDoc(doc),
    } as AbstractBatch;
  });

  ops.push({ type: 'put', key: '!configs!lastSeq', value: resultSequence });

  await base().batch(ops);
}

async function updateLevelDB(
  sourceDb: PouchDB.Database,
  lastSeq: string | number
): Promise<void> {
  const { last_seq: resultLastSeq, results } = await sourceDb.changes<
    models.CouchDocTypes
  >({
    include_docs: true,
    since: lastSeq,
    limit: 100,
    batch_size: 100,
  });

  if (results.length === 0) {
    return;
  }

  const ops: AbstractBatch[] = results.flatMap(change => {
    if (change.id.startsWith('$/queue/')) {
      // TODO currently this means that notes from other devices
      // won't show up until they get synced on my laptop
      return [];
    } else if (change.deleted) {
      return {
        type: 'del',
        key: `!topics!${lastSlashItem(change.id)}`,
      };
    } else if (change.doc) {
      return {
        type: 'put',
        key: `!topics!${lastSlashItem(change.id)}`,
        value: stripDoc(change.doc),
      };
    } else {
      return [];
    }
  });

  ops.push({ type: 'put', key: '!configs!lastSeq', value: resultLastSeq });

  await base().batch(ops);

  return updateLevelDB(sourceDb, resultLastSeq);
}

let remoteDbMemoized: PouchDB.Database;
function getRemoteDb() {
  if (!remoteDbMemoized) {
    const config = getDbTarget();
    remoteDbMemoized = new PouchDB(config.url, config);
  }

  return remoteDbMemoized;
}

let localDbMemoized: PouchDB.Database;
function getLocalDb() {
  if (!localDbMemoized) {
    localDbMemoized = new PouchDB('wiki', {
      auto_compaction: true,
    });
  }

  return localDbMemoized;
}

function getDbTarget() {
  if (localStorage.couchdb_target) {
    try {
      const config = JSON.parse(localStorage.couchdb_target);
      if (!config.url || !config.auth) {
        throw new Error('Invalid db target config');
      }

      return config;
    } catch (e) {
      reportError(e);
      delete localStorage.couchdb_target;
    }
  }

  return null;
}

async function getLastSeq() {
  const configsLevelDB = dbNamespace('configs');
  return configsLevelDB.get('lastSeq').catch((err: Error) => {});
}

async function attemptNoteUpload(note: models.Note) {
  const localDb = getLocalDb();
  await localDb.put(note);

  if (!navigator.onLine) {
    return;
  }

  const remoteDb = getRemoteDb();
  localDb.sync(remoteDb);
}

export function hash(s: string) {
  return md5(s);
}

function lastSlashItem(docId: string) {
  return reverseSlashes(docId)[0];
}

function reverseSlashes(v: string) {
  return v.split('/').reverse();
}

function getAll<D>(
  db: LevelUp,
  options?: AbstractIteratorOptions
): Promise<D[]> {
  const list = [] as D[];
  return new Promise((resolve, reject) => {
    db.createValueStream(options)
      .on('data', (data: D) => list.push(data))
      .on('error', (err: Error) => reject(err))
      .on('end', () => resolve(list));
  });
}

function stripDoc<D extends {}>(doc: PouchDB.Core.ExistingDocument<D>): D {
  delete doc._id;
  delete doc._rev;

  return doc;
}
