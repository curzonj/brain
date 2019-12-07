import PouchDB from 'pouchdb';
import { getDB, remote } from './db';
import { ComplexError } from '../common/errors';
import * as models from '../common/models';
import { schemaSelector } from './schema';
import { exportFile } from './paths';
import { leveldb } from './leveldb';
import {
  getAllDocs,
  updateLevelDB,
  getLastSeq,
  importTopicsToLevelDB,
} from '../common/content';

const couchDbSchema = schemaSelector('payload');

export async function getAllDocsHash(): Promise<models.Map<models.Existing>> {
  const db = await getDB();
  const { rows } = await getAllDocs(db);

  return rows
    .map(r => r.doc)
    .reduce(
      (acc: models.Map<models.Existing>, doc: models.Existing | undefined) => {
        if (doc) acc[doc.metadata.id] = doc;
        return acc;
      },
      {}
    );
}

export async function syncPhase() {
  const db = await getDB();
  console.log('Replicating...');
  await db.sync(remote);
  await dumpJSON();
  await syncToLevelDB(db);
}

// TODO this is missing the use case to delete the leveldb
// when the database structure is supposed to change. For
// now I'll just have to rm-rf the directory manually
async function syncToLevelDB(sourceDb: PouchDB.Database) {
  const lastSeq = await getLastSeq(leveldb);

  if (!lastSeq) {
    await importTopicsToLevelDB(leveldb, sourceDb);
  } else {
    await updateLevelDB(leveldb, sourceDb, lastSeq);
  }
}

export async function applyChanges(
  updates: models.Update[],
  docsToDelete: models.Existing[] = []
) {
  const deletes = docsToDelete.map(
    d => ({ ...d, _deleted: true } as models.Update)
  );
  const changes = [...updates, ...deletes];
  if (changes.length === 0) {
    console.log('No changes, skipping applyChanges');
    return;
  }

  validateUpdates(changes);

  const db = await getDB();
  await db.bulkDocs(changes);
  await syncPhase();
}

function validateUpdates(updates: models.Update[]) {
  const errors = updates.flatMap(u => {
    if (couchDbSchema(u)) {
      return [];
    }

    return { update: u, errors: couchDbSchema.errors };
  });

  errors.forEach(e => {
    console.dir(e.update);
    console.dir(e.errors);
  });

  if (errors.length > 0) {
    throw new ComplexError("update didn't match the schema", {
      errors,
    });
  }
}

export async function dumpJSON() {
  const db = await getDB();

  const { rows } = await db.allDocs({
    include_docs: true,
  });

  const docs = rows.map(r => r.doc);

  exportFile('couchdb_dump.json', JSON.stringify(docs, null, ' '));
}

export function topicToDocID(topicID: string): string {
  if (topicID.startsWith('/')) {
    throw new ComplexError('invalid topicID', {
      topicID,
    });
  }

  return `$/topics/${topicID}`;
}

export function findMissingReferences(
  topics: models.TopicFields[],
  keys: models.Map<any>
) {
  return topics.flatMap(topic =>
    models
      .getAllRefs(topic)
      .filter(s => keys[s.ref] === undefined)
      .map(s => s.ref)
  );
}

export function buildReverseMappings(
  allDocs: models.Map<models.Payload>,
  excludeDeprecated: boolean = false
) {
  return Object.values(allDocs).reduce(
    (acc: models.Map<models.Payload[]>, doc: models.Payload) => {
      models
        .getAllRefs(doc.topic, excludeDeprecated)
        .forEach(r => (acc[r.ref] = acc[r.ref] || []).push(doc));
      return acc;
    },
    {}
  );
}
