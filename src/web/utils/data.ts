import PouchDB from 'pouchdb';
import cuid from 'cuid';

import * as leveldb from './leveldb';
import { reportError, ComplexError, annotateErrors } from '../../common/errors';
import * as models from '../../common/models';

export async function getReverseMappings(
  topicId: string
): Promise<models.Doc[]> {
  const hashed = leveldb.hash(topicId);
  const glob = await Promise.all(
    Object.values(leveldb.topics.idx).map(idx => idx.get(hashed))
  );

  return glob.flat();
}

export async function getTopic(topicKey: string): Promise<models.Doc | void> {
  return annotateErrors({ topicKey }, () =>
    leveldb.topics.get(leveldb.hash(topicKey))
  ).catch(err => {
    if (err.name === 'NotFoundError' && err.details) {
      console.log({ error: err.message, ...err.details });
    } else {
      reportError(err);
    }
  });
}

export async function getNotes(topicId: string): Promise<string[]> {
  const list = [] as string[];
  const notesLevelDB = leveldb.notes.sub(topicId);

  // merely by returning the entire list here, unsaved notes
  // would gain the more link, but if you were to add a note
  // onto that unsaved note, the sync would break
  await notesLevelDB.forEach({}, (k, value) => {
    if (!value.text) {
      throw new ComplexError(
        'note in the datastore is missing the text field',
        {
          key: k,
          value,
        }
      );
    }
    list.push(value.text);
  });

  return list;
}

export async function addNote(topicId: string, text: string) {
  if (!topicId.startsWith('/')) {
    topicId = `/${topicId}`;
  }
  if (topicId === '/index') {
    topicId = '/inbox';
  }

  const lastSeq = await getLastSeq();
  const notesLevelDB = leveldb.notes.sub(topicId);
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

  reportError(async () => attemptNoteUpload(payload), {
    file: 'db',
    fn: 'attemptNoteUpload',
  });
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

  // TODO once I have a better idea of what errors from
  // this can look like I'll delete the config and return
  // false sometimes
  reportError(async () => remoteDb.info(), {
    at: 'db.isConfigured',
  });

  return true;
}

export async function uploadNotes(sourceDb: PouchDB.Database) {
  await leveldb.notes.forEach({}, async (k, doc) => {
    const docId = doc._id;

    if (docId === undefined) {
      return reportError(new Error('doc is missing _id'), {
        file: 'db',
        fn: 'uploadNotes',
        doc,
      });
    }

    const existing = await sourceDb
      .get(docId)
      .catch(async (e: PouchDB.Core.Error) => {
        if (e.status !== 404) {
          reportError(e, {
            file: 'db',
            fn: 'uploadNotes',
            doc,
          });

          return e;
        }

        if (e.reason === 'deleted') {
          // the translation between these IDs and couchdb is a
          // little broken so it's easier to just delete them from levelDB
          // when they are deleted from couchdb
          const topicNotes = leveldb.notes.sub(doc.topic_id);
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
      await sourceDb.put(doc).catch(e =>
        reportError(e, {
          file: 'db',
          fn: 'uploadNotes',
          doc,
        })
      );
    }
  });
}

export async function initialize(): Promise<boolean> {
  const ready = await isConfigured();
  if (!ready) {
    return false;
  }

  // Don't wait for this
  reportError(sync);

  return true;
}

async function sync() {
  if (!navigator.onLine) {
    return;
  }

  const remoteDb = getRemoteDb();

  await syncToLevelDB(remoteDb);
  await uploadNotes(remoteDb);

  console.log('sync complete');
}

async function syncToLevelDB(sourceDb: PouchDB.Database) {
  const lastSeq = await getLastSeq();
  const schemaCurrent = await leveldb.isStorageSchemaCurrent();

  if (!lastSeq || !schemaCurrent) {
    await leveldb.resetStorageSchema();
    await importTopicsToLevelDB(sourceDb);
  } else {
    await updateLevelDB(sourceDb, lastSeq);
  }
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

  await Promise.all(
    rows.map(async ({ doc }) => {
      if (doc) {
        await leveldb.topics.put(lastSlashItem(doc._id), stripDoc(doc));
      }
    })
  );

  await leveldb.configs.put('lastSeq', resultSequence);
  await leveldb.write();
}

async function updateLevelDB(
  sourceDb: PouchDB.Database,
  outerLastSeq: string | number
): Promise<void> {
  const inner = async (lastSeq: string | number) => {
    const { last_seq: resultLastSeq, results } = await sourceDb.changes<
      models.CouchDocTypes
    >({
      include_docs: true,
      since: lastSeq,
      limit: 100,
      batch_size: 100,
    });

    await Promise.all(
      results.map(async change => {
        if (change.id.startsWith('$/queue/')) {
          // TODO currently this means that notes from other devices
          // won't show up until they get synced on my laptop
          return;
        } else if (change.deleted) {
          await leveldb.topics.del(lastSlashItem(change.id));
        } else if (change.doc && change.doc.id) {
          await leveldb.topics.put(lastSlashItem(change.id), stripDoc(
            change.doc
          ) as models.Doc);
        }
      })
    );

    await leveldb.configs.put('lastSeq', resultLastSeq);
    await leveldb.write();

    return { results: results.length, seq: resultLastSeq };
  };

  const following = async ({
    results,
    seq,
  }: {
    results: number;
    seq: string | number;
  }): Promise<void> => {
    if (results > 0) {
      return inner(seq).then(following);
    }
  };

  return inner(outerLastSeq).then(following);
}

let remoteDbMemoized: PouchDB.Database;
function getRemoteDb() {
  if (!remoteDbMemoized) {
    const config = getDbTarget();

    if (!config) {
      throw new Error('database configuration unavailable');
    }

    remoteDbMemoized = new PouchDB(config.url, config);
  }

  return remoteDbMemoized;
}

type DbConfigObject = {
  url: string;
} & PouchDB.Configuration.RemoteDatabaseConfiguration;
function getDbTarget(): DbConfigObject | undefined {
  if (!localStorage.couchdb_target) {
    return;
  }

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

async function getLastSeq(): Promise<number | string | undefined> {
  return leveldb.configs.get('lastSeq').catch((err: Error) => undefined);
}

async function attemptNoteUpload(note: models.Note) {
  if (!navigator.onLine) {
    return;
  }

  const remoteDb = getRemoteDb();
  await remoteDb.put(note);
}

function lastSlashItem(docId: string) {
  return reverseSlashes(docId)[0];
}

function reverseSlashes(v: string) {
  return v.split('/').reverse();
}

function stripDoc<D extends {}>(doc: PouchDB.Core.ExistingDocument<D>): D {
  delete doc._id;
  delete doc._rev;

  return doc;
}
