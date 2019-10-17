import * as crypto from 'crypto';
import * as fs from 'fs';
import cuid from 'cuid';
import { getDB } from './db';
import { ComplexError } from '../common/errors';
import * as models from '../common/models';
import { schemaSelector } from './schema';

const couchDbSchema = schemaSelector('couchTopicUpdate');

export async function getAllDocsHash() {
  const db = await getDB();
  const { rows } = await db.allDocs<models.ExistingDoc>({
    include_docs: true,
    startkey: '$/topics/',
    endkey: '$/topics/\ufff0',
  });

  return rows.reduce(
    (acc, { doc }) => {
      if (doc) {
        acc[doc.id] = doc;
      }
      return acc;
    },
    {} as models.AllDocsHash
  );
}

export async function applyChanges(
  updates: models.DocUpdate[],
  docsToDelete: models.ExistingDoc[] = []
) {
  const deletes = docsToDelete.map(
    d => ({ ...d, _deleted: true } as models.DocUpdate)
  );
  const changes = [...updates, ...deletes];

  validateUpdates(changes);

  const db = await getDB();

  const bulkDocsResult = await db.bulkDocs(changes);
  console.log(bulkDocsResult.filter(bdRes => !(bdRes as any).ok));

  await dumpJSON();
}

function validateUpdates(updates: models.DocUpdate[]) {
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

  fs.writeFileSync(
    `${__dirname}/../../exports/couchdb_dump.json`,
    JSON.stringify(docs, null, ' ')
  );
}

export function hash(s: string): string {
  const h = crypto.createHash('md5');
  h.update(s);
  return h.digest('hex');
}

export function topicToDocID(topicID: string): string {
  if (!topicID.startsWith('/')) {
    throw new ComplexError('invalid topicID', {
      topicID,
    });
  }

  return `$/topics/${hash(topicID)}`;
}

export function unstackNestedDocuments(
  doc: models.DocUpdate,
  docEntries: models.DocUpdate[]
) {
  function inner(field: string) {
    const list: any = doc[field];
    if (!Array.isArray(list)) return;

    doc[field] = list.map((item: any) => {
      if (typeof item === 'string' && item.startsWith('/')) return item;
      if (item.ref && item.label) return item.ref;

      const newId = `/${cuid()}`;
      const newTopic = {
        _id: topicToDocID(newId),
        id: newId,
        related: [doc.id],
        created_at: Date.now(),
      } as models.DocUpdate;

      if (typeof item === 'string') {
        newTopic.text = item;
      } else {
        Object.assign(newTopic, item);
        unstackNestedDocuments(newTopic, docEntries);
      }

      // tag: specialAttributes
      if (!newTopic.text) {
        delete newTopic.created_at;
      }

      docEntries.push(newTopic);

      return newTopic.id;
    });
  }

  ['notes', 'next', 'later', 'list', 'related'].forEach(inner);
}

export function findMissingReferences(
  allDocs: models.EditorStructure | models.AllDocsHash
) {
  return Object.values(allDocs).flatMap(topic =>
    Object.keys(topic).flatMap(k => {
      if (k === 'links') {
        return [];
      }
      if (k === 'props') {
        return [];
      }
      const value = [topic[k]].flat();
      return value
        .filter(s => s.startsWith && s.startsWith('/'))
        .filter(s => !(allDocs[s] || allDocs[s.slice(1)]));
    })
  );
}

export type ReverseMap = Record<string, models.Doc[]>;
export function buildReverseMappings(allDocs: models.AllDocsHash): ReverseMap {
  const reverse = {} as ReverseMap;
  function append(id: any, doc: models.Doc) {
    if (typeof id === 'string' && id.startsWith('/') && id !== doc.id) {
      reverse[id] = reverse[id] || [];
      reverse[id].push(doc);
    }
  }

  Object.values(allDocs).forEach(doc =>
    Object.keys(doc).forEach(k => {
      const field = doc[k];
      if (Array.isArray(field)) {
        field.forEach(f => append(f, doc));
      } else {
        append(field, doc);
      }
    })
  );

  return reverse;
}

export function findDoubledRelations(allDocs: models.AllDocsHash) {
  const reverse = {} as ReverseMap;
  function append(id: any, doc: models.Doc) {
    if (typeof id === 'string' && id.startsWith('/') && id !== doc.id) {
      reverse[id] = reverse[id] || [];
      reverse[id].push(doc);
    }
  }

  Object.values(allDocs).forEach(doc =>
    (doc.related || []).forEach(k => {
      const field = doc[k];
      if (Array.isArray(field)) {
        field.forEach(f => append(f, doc));
      } else {
        append(field, doc);
      }
    })
  );

  return Object.keys(reverse).flatMap(k =>
    reverse[k]
      .filter(doc2 => (reverse[doc2.id] || []).find(doc3 => doc3.id === k))
      .map(doc2 => ({ k, k2: doc2.id }))
  );
}
