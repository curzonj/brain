import PouchDB from 'pouchdb';
import cuid from 'cuid';

import * as leveldb from '../../common/leveldb';
import { reportError, ComplexError, annotateErrors } from '../../common/errors';
import * as models from '../../common/models';
import { wrapProfiling } from '../../common/performance';
import { Rendezvous } from '../../common/typed_event';

export const loading = new Rendezvous<boolean>();

export async function getReverseMappings({
  topic,
  metadata,
}: models.Payload): Promise<models.Payload[]> {
  const outbound = models.getAllRefs(topic, true).map(r => r.ref);
  const backrefs = await leveldb.topics.idx.backrefs.get(metadata.id);

  return backrefs
    .filter(d => d.metadata.stale_at === undefined)
    .filter(d => outbound.indexOf(d.metadata.id) === -1);
}

export async function getTopic(
  topicKey: string
): Promise<models.Payload | undefined> {
  return annotateErrors({ topicKey }, async () =>
    leveldb.topics.get(topicKey)
  ).catch(err => {
    if (err.name === 'NotFoundError' && err.details) {
      if (loading.isPending()) {
        return loading.then(() => getTopic(topicKey));
      } else {
        console.log({ error: err.message, ...err.details });
      }
    } else {
      reportError(err);
    }
  });
}

export async function addNote(topicId: string, text: string) {
  if (topicId === 'index') {
    topicId = 'inbox';
  }
  text = text.trim();
  const id = cuid();
  const payload: models.Update = {
    _id: topicToDocID(id),
    metadata: { id, created_at: Date.now() },
    topic: {
      broader: [{ ref: topicId }],
    },
  };
  if (text.startsWith('http')) {
    payload.topic.link = text;
  } else {
    payload.topic.text = text;
  }

  await leveldb.uploads.put(id, payload);
  await leveldb.topics.put(id, payload);
  await leveldb.write();

  if (navigator.onLine) {
    const remoteDb = getRemoteDb();
    reportError(async () => attemptNoteUpload(payload, remoteDb), {
      file: 'db',
      fn: 'attemptNoteUpload',
    });
  }
}
export function configure(value: string) {
  JSON.parse(value);
  localStorage.couchdb_target = value;

  backgroundSync();
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
  await leveldb.uploads.forEach({}, async (k, doc) => {
    await attemptNoteUpload(doc, sourceDb);
  });
}

export async function initialize(): Promise<boolean> {
  const ready = await isConfigured();
  if (!ready) {
    return false;
  }

  backgroundSync();

  return true;
}

function backgroundSync() {
  if (loading.hasFired()) return;

  if (!navigator.onLine) {
    loading.done(true);
    return;
  }

  reportError(async () => {
    const remoteDb = getRemoteDb();
    await syncToLevelDB(remoteDb);
    loading.done(true);
    await uploadNotes(remoteDb);
  });
}

async function syncToLevelDB(sourceDb: PouchDB.Database) {
  await wrapProfiling('syncToLevelDB', async () => {
    const lastSeq = await getLastSeq();
    const schemaCurrent = await leveldb.isStorageSchemaCurrent();

    if (!lastSeq || !schemaCurrent) {
      await leveldb.resetStorageSchema();
      await importTopicsToLevelDB(sourceDb);
    } else {
      await updateLevelDB(sourceDb, lastSeq);
    }
  });
}

async function importTopicsToLevelDB(sourceDb: PouchDB.Database) {
  const { rows, update_seq: resultSequence } = await sourceDb.allDocs<
    models.Payload
  >({
    include_docs: true,
    startkey: `$/topics/`,
    endkey: `$/topics/\uFFF0`,
    update_seq: true,
  });

  await Promise.all(
    rows.map(async ({ doc }) => {
      if (doc) {
        await leveldb.topics.put(lastSlashItem(doc._id), stripDoc(doc), {
          freshIndexes: true,
        });
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
      models.Payload
    >({
      include_docs: true,
      since: lastSeq,
      limit: 200,
      batch_size: 200,
    });

    await Promise.all(
      results.map(async change => {
        if (change.id.startsWith('$/queue/')) {
          // TODO currently this means that notes from other devices
          // won't show up until they get synced on my laptop
          return;
        } else if (change.deleted) {
          await leveldb.topics.del(lastSlashItem(change.id));
        } else if (change.doc && change.doc.metadata) {
          await leveldb.topics.put(
            lastSlashItem(change.id),
            stripDoc(change.doc)
          );
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

async function attemptNoteUpload(
  payload: models.Create<models.Payload>,
  sourceDb: PouchDB.Database
) {
  try {
    await sourceDb.put(payload);
  } catch (e) {
    if (e.status !== 409) {
      reportError(e);
      return;
    }
  }

  await leveldb.uploads.del(payload.metadata.id, { writeBatch: true });
}

function lastSlashItem(docId: string) {
  return reverseSlashes(docId)[0];
}

function reverseSlashes(v: string) {
  return v.split('/').reverse();
}

function stripDoc({
  topic,
  metadata,
}: models.Create<models.Payload>): models.Payload {
  return { topic, metadata };
}

function topicToDocID(topicID: string): string {
  if (topicID.startsWith('/')) {
    throw new ComplexError('invalid topicID', {
      topicID,
    });
  }

  return `$/topics/${topicID}`;
}
