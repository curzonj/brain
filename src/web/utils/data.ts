import PouchDB from 'pouchdb';
import cuid from 'cuid';

import {
  catchError,
  reportError,
  ComplexError,
  annotateErrors,
} from '../../common/errors';
import * as models from '../../common/models';
import { wrapProfiling } from '../../common/performance';
import { Rendezvous } from '../../common/typed_event';
import {
  getLastSeq,
  updateLevelDB,
  importTopicsToLevelDB,
} from '../../common/content';
import leveljs from 'level-js';
import memdown from 'memdown';
import {
  buildLevelDB,
  isTestEnv,
  codeStorageVersion,
} from '../../common/leveldb';

export const loading = new Rendezvous<boolean>('dataLoading');

const leveljsStore = isTestEnv() ? memdown() : leveljs('wiki');
export const leveldb = buildLevelDB(leveljsStore);

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
    catchError(async () => attemptNoteUpload(payload, remoteDb), {
      at: 'data.addNote',
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
  catchError(async () => remoteDb.info(), {
    at: 'data.isConfigured',
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

  catchError(
    async () => {
      try {
        const remoteDb = getRemoteDb();
        await syncToLevelDB(remoteDb);
        await uploadNotes(remoteDb);
      } finally {
        loading.done(true);
      }
    },
    { at: 'data.backgroundSync' }
  );
}

async function syncToLevelDB(sourceDb: PouchDB.Database) {
  await wrapProfiling('syncToLevelDB', async () => {
    const lastSeq = await getLastSeq(leveldb);
    const schemaCurrent = await isStorageSchemaCurrent();

    if (!lastSeq || !schemaCurrent) {
      await resetStorageSchema();
      await importTopicsToLevelDB(leveldb, sourceDb);
    } else {
      await updateLevelDB(leveldb, sourceDb, lastSeq);
    }
  });
}

async function isStorageSchemaCurrent(): Promise<boolean> {
  const value = await leveldb.configs
    .get('storageVersion')
    .catch((err: Error) => undefined);

  return value && value >= codeStorageVersion;
}

async function resetStorageSchema() {
  console.log('Resetting storage schema');
  await leveljsStore.store('readwrite').clear();
  await leveldb.configs.put('storageVersion', codeStorageVersion);
  await leveldb.write();
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

function topicToDocID(topicID: string): string {
  if (topicID.startsWith('/')) {
    throw new ComplexError('invalid topicID', {
      topicID,
    });
  }

  return `$/topics/${topicID}`;
}
