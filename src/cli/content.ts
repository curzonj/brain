import * as crypto from 'crypto';
import * as fs from 'fs';
import { deepEqual } from 'fast-equals';
import { getDB } from './db';
import { ComplexError } from '../common/errors';
import * as models from '../common/models';
import { schemaSelector } from './schema';
import { isValidLiteralType } from '../common/rdf';

const couchDbSchema = schemaSelector('couchTopicUpdate');

export async function applyChanges(
  updates: models.DocUpdate[],
  docsToDelete: models.ExistingDoc[]
) {
  const deletes = docsToDelete.map(
    d => ({ ...d, _deleted: true } as models.DocUpdate)
  );
  const changes = [...updates, ...deletes];

  validateUpdates(changes);

  const db = await getDB();

  await db.bulkDocs(changes);
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
    console.log(e.update);
    console.log(e.errors);
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

export function topicToDocID(topicID: string): string {
  function hash(s: string): string {
    const h = crypto.createHash('md5');
    h.update(s);
    return h.digest('hex');
  }

  if (!topicID.startsWith('/')) {
    throw new ComplexError('invalid topicID', {
      topicID,
    });
  }

  return `$/topics/${hash(topicID)}`;
}

export function generatePatches(
  comparison: models.EditorDoc,
  doc: models.DocUpdate
) {
  const list = [] as models.DocChangeEntry[];

  try {
    diffToDocMissingPatches(comparison, doc, list);
    diffToDocChangePatches(comparison, doc, list);
  } catch (e) {
    console.log({ comparison, doc });
    throw e;
  }

  // This is a bit legacy from when I was type casting the value
  // and it violated type safety
  const invalid = list.filter(
    e =>
      !e.value || (typeof e.value !== 'string' && typeof e.value !== 'number')
  );
  if (invalid.length > 0) {
    throw new ComplexError('generated invalid patches', {
      comparison,
      doc,
      invalid,
    });
  }

  doc.patches = list;
}

function diffToDocMissingPatches(
  orig: models.EditorDoc,
  doc: models.EditorDoc,
  list: models.DocChangeEntry[]
) {
  Object.keys(orig).forEach((k: string) => {
    if (!doc[k]) {
      const value = orig[k] as models.RegularDocValueTypes;
      if (models.isPatches(k, value) || models.isStorageField(k)) {
        return;
      } else if (models.isDocArrayField(k, value)) {
        value.forEach((v: models.Link) => {
          addPatch(list, 'remove', k, v);
        });
      } else {
        addPatch(list, 'remove', k, value);
      }
    }
  });
}

function diffToDocChangePatches(
  orig: models.EditorDoc,
  doc: models.EditorDoc,
  list: models.DocChangeEntry[]
) {
  Object.keys(doc).forEach((k: string) => {
    if (models.isStorageField(k)) {
      return;
    }

    const origValue = orig[k] as models.RegularDocValueTypes;
    const newValue = doc[k] as models.RegularDocValueTypes;

    if (
      Array.isArray(newValue) &&
      (Array.isArray(origValue) || origValue === undefined)
    ) {
      findMissingItems(origValue || [], newValue).forEach(v =>
        addPatch(list, 'remove', k, v)
      );
      findMissingItems(newValue, origValue || []).forEach(v =>
        addPatch(list, 'add', k, v)
      );
    } else if (origValue !== newValue) {
      addPatch(list, 'remove', k, origValue);
      addPatch(list, 'add', k, newValue);
    }
  });
}

function addPatch(
  list: models.DocChangeEntry[],
  op: 'add' | 'remove',
  field: string,
  value: undefined | models.RegularDocValueTypes
) {
  if (value === undefined) {
    return;
  }

  if (isValidLiteralType(value)) {
    list.push({ op, field, value });
  } else if (models.isLabeledLink(value)) {
    list.push({ op, field, value: value.link });
  } else {
    throw new ComplexError('unable to generate patch for object', {
      op,
      field,
      value,
    });
  }
}

function isAllStrings(list: any[]): list is string[] {
  return list.every(i => typeof i === 'string');
}

function findMissingItems<T>(l1: T[], l2: T[]): T[] {
  if (isAllStrings(l1) && isAllStrings(l2)) {
    return l1.filter((i: T) => l2.indexOf(i) === -1);
  } else {
    // Find all the items in l1 where none of the items
    // in l2 match via deepEqual
    return l1.filter((i: T) => !l2.find((l2i: T) => deepEqual(i, l2i)));
  }
}
