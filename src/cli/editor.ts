import { spawn } from 'child_process';
import { deepEqual } from 'fast-equals';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as tmp from 'tmp';
import { pick } from 'lodash';

import {
  applyChanges,
  topicToDocID,
  unstackNestedDocuments,
  findMissingReferences,
  getAllDocsHash,
  buildReverseMappings,
} from './content';
import { getDB } from './db';
import { ComplexError } from '../common/errors';
import * as models from '../common/models';
import { EditorDoc, EditorStructure, Ref } from '../common/models';
import { schemaSelector } from './schema';

const editorSchema = schemaSelector('editor');

type editFileResult =
  | { content: EditorStructure; changed: boolean }
  | undefined;
type resolveFunc = (value: editFileResult | Promise<editFileResult>) => void;
type rejectFunc = (error: Error) => void;
type invalidResultHandler = (
  err: any,
  originalInput: string,
  editorContents: string
) => Promise<editFileResult>;

export async function editFile(
  input: string,
  onInvalidResult: invalidResultHandler,
  originalInput?: string
): Promise<editFileResult> {
  return new Promise((resolve, reject) => {
    try {
      const file = tmp.fileSync({ postfix: '.yml' });
      fs.writeSync(file.fd, input);
      fs.closeSync(file.fd);

      spawn(process.env.EDITOR || 'vim', [file.name], { stdio: 'inherit' }).on(
        'exit',
        () =>
          onEditorExit(
            file,
            originalInput || input,
            onInvalidResult,
            resolve,
            reject
          )
      );
    } catch (err) {
      reject(err);
    }
  });
}

function onEditorExit(
  file: tmp.FileResult,
  input: string,
  onInvalidResult: invalidResultHandler,
  resolve: resolveFunc,
  reject: rejectFunc
) {
  let editorContents;
  try {
    editorContents = fs.readFileSync(file.name).toString();
    file.removeCallback();
  } catch (err) {
    reject(err);
    return;
  }

  if (editorContents.trim() === '') {
    resolve(undefined);
    return;
  }

  fs.writeFileSync(`${__dirname}/../../exports/kb.yml`, editorContents);

  let result;
  try {
    result = yaml.safeLoad(editorContents);
    const errors = findErrors(result);
    if (errors) {
      resolve(onInvalidResult(errors, input, editorContents));
    } else {
      resolve({
        content: result,
        changed: editorContents !== input,
      });
    }
  } catch (err) {
    resolve(onInvalidResult(err, input, editorContents));
  }
}

async function computeDeletions(
  content: EditorStructure,
  newContent: EditorStructure
) {
  const db = await getDB();

  return Promise.all(
    Object.keys(content)
      .filter(k => newContent[k] === undefined)
      .map(async k => {
        try {
          return db.get(topicToDocID(k));
        } catch (e) {
          throw new ComplexError('Problem fetching deleted document', {
            cause: e,
            key: k,
            content: content[k],
          });
        }
      })
  );
}

function findMissingItems<T>(l1: T[], l2: T[]): T[] {
  // Find all the items in l1 where none of the items
  // in l2 match via deepEqual
  return l1.filter((i: T) => !l2.find((l2i: T) => deepEqual(i, l2i)));
}

async function computeUpdates(
  contentList: EditorStructure,
  newContentList: EditorStructure
) {
  const db = await getDB();
  const changedKeys = Object.keys(newContentList).filter(
    k => !contentList[k] || !deepEqual(contentList[k], newContentList[k])
  );

  // tag: specialAttributes
  changedKeys.forEach(k => {
    const newTopicContent = newContentList[k];
    if (!newTopicContent.notes) return;

    const previousContent = contentList[k] || {};
    const justRefs = newTopicContent.notes.filter(models.isRef);
    const added = findMissingItems<Ref>(justRefs, previousContent.notes || []);
    const removed = findMissingItems<Ref>(
      previousContent.notes || [],
      justRefs
    );

    // For each note added to this topic, add this topic to the note's related list
    added.forEach(ref => {
      const id = ref.ref;
      const target = newContentList[id];
      let broader: models.Ref[];
      if (target) {
        if (target.stale) {
          broader = target.broader = [];
        } else {
          broader = target.broader = target.broader || [];
        }
      } else {
        // this ensures that the findMissingReferences checker will pick this up
        broader = newTopicContent.broader = newTopicContent.broader || [];
      }

      if (!broader.some(b => b.ref === k)) broader.push({ ref: k });
    });

    // For each note removed from this topic, remove this topic from the note's broader list
    removed.forEach(ref => {
      const id = ref.ref;
      const target = newContentList[id];
      if (!target) return;
      const newList = (target.broader || []).filter(r => r.ref !== k);
      if (newList.length === 0) {
        target.stale = true;
      } else {
        target.broader = newList;
      }
    });
  });

  return (await Promise.all(
    changedKeys.map(async k => {
      const docId = topicToDocID(k);
      const oldDoc = await db
        .get(docId)
        .catch(() => ({ _id: docId, created_at: Date.now() }));

      const newContent = newContentList[k];

      // tag: specialAttributes
      if (oldDoc.stale_at === undefined && newContent.stale === true)
        newContent.stale_at = Date.now();
      delete newContent.stale;

      // tag: specialAttributes
      delete newContent.backrefs;
      delete newContent.quotes;

      const newTopicContent = {
        id: k,
        // tag: specialAttributes
        ...pick(oldDoc, ['_id', '_rev', 'created_at']),
        ...newContent,
      } as models.DocUpdate;

      // tag: specialAttributes
      if (!newTopicContent.text) {
        delete newTopicContent.created_at;
      } else if (!newTopicContent.created_at) {
        newTopicContent.created_at = Date.now();
      }

      const docEntries = [] as models.DocUpdate[];
      unstackNestedDocuments(newTopicContent, docEntries);

      docEntries.push(newTopicContent);

      return docEntries;
    })
  )).flat();
}

export async function applyEditorChanges(
  content: EditorStructure,
  newContent: EditorStructure
) {
  sanitizeRewrites(newContent);
  sanitizeRewrites(content);

  const deletes = await computeDeletions(content, newContent);
  const updates = await computeUpdates(content, newContent);

  await applyChanges(updates, deletes);
}

function findErrors(doc: EditorStructure) {
  if (!editorSchema(doc)) {
    return editorSchema.errors;
  }

  const missing = findMissingReferences(doc);
  if (missing.length > 0) {
    return [{ missing }];
  }

  return undefined;
}

export function sortedYamlDump(input: object): string {
  return yaml.safeDump(input, {
    sortKeys(a, b) {
      const fieldOrder = [
        'title',
        'stale',
        'type',
        'link',
        'label',
        'ref',
        'aka',
        'text',
        'src',
        'props',
        'next',
        'later',
        'related',
        'broader',
        'backrefs',
        'links',
        'list',
        'narrower',
        'collection',
        'quotes',
        'notes',
      ];

      for (const name of fieldOrder) {
        if (a === name) {
          return -1;
        }
        if (b === name) {
          return 1;
        }
      }

      if (a > b) {
        return 1;
      }
      return a < b ? -1 : 0;
    },
  });
}

interface ReverseMappings {
  notes?: Ref[];
  backrefs?: Ref[];
  quotes?: Ref[];
}
function buildSortedReverseMappings(
  allDocs: models.AllDocsHash
): Record<string, ReverseMappings> {
  const reverse = buildReverseMappings(allDocs);
  return Object.fromEntries(
    Object.entries(reverse)
      .map(
        ([referencedId, list]) =>
          [
            referencedId,
            list.filter(
              referencingDoc =>
                !referencingDoc.stale_at &&
                // This removes any backrefs that are already included in some list field of the referenced doc
                (!reverse[referencingDoc.id] ||
                  !reverse[referencingDoc.id].some(d => d.id === referencedId))
            ),
          ] as [string, models.Doc[]]
      )
      .map(([k, v]) => {
        const notes = v
          .filter(d => d.title === undefined && d.src !== k)
          .sort((a, b) => {
            if (!a.created_at || !b.created_at) return 0;
            if (a.created_at > b.created_at) return -1;
            if (a.created_at < b.created_at) return 1;
            return 0;
          })
          .map(d => d.id)
          .map(ref => ({ ref }));
        const quotes = v
          .filter(d => d.src === k)
          .map(d => d.id)
          .sort()
          .map(ref => ({ ref }));
        const backrefs = v
          .filter(d => d.title !== undefined)
          .map(d => d.id)
          .sort()
          .map(ref => ({ ref }));

        const ret = {} as ReverseMappings;
        if (notes.length > 0) ret.notes = notes;
        if (quotes.length > 0) ret.quotes = quotes;
        if (backrefs.length > 0) ret.backrefs = backrefs;

        return [k, ret];
      })
  );
}

export async function buildEditorStructure(): Promise<EditorStructure> {
  const allDocs = await getAllDocsHash();
  const allMappings = buildSortedReverseMappings(allDocs);
  const rendered = Object.values(allDocs).reduce(
    (acc, doc) => {
      const shortDoc = models.removeStorageAttributes(doc) as EditorDoc;

      // tag: specialAttributes
      delete shortDoc.created_at;

      // tag: specialAttributes
      const backrefs = allMappings[doc.id];
      if (backrefs) Object.assign(shortDoc, backrefs);

      acc[doc.id] = shortDoc;

      return acc;
    },
    {} as Record<string, EditorDoc>
  );

  finalizeEditorStructure(rendered);

  if (!editorSchema(rendered)) {
    console.dir(editorSchema.errors);
    throw new Error('rendered content for editor is invalid');
  }

  return rendered;
}

function sanitizeRewrites(result: EditorStructure) {
  Object.values(result).forEach(doc => {
    Object.keys(doc).forEach((k: string) => {
      const list = doc[k];
      if (!list || !Array.isArray(list)) return;
      list.forEach(item => {
        if (models.isRef(item)) delete item.label;
      });
    });
  });
}

export function finalizeEditorStructure(rendered: EditorStructure) {
  Object.values(rendered).forEach((doc: EditorDoc) => {
    // tag: specialAttributes
    if (doc.stale_at !== undefined) {
      doc.stale = true;
      delete doc.stale_at;
    }

    renderRefsInDoc(rendered, doc);
  });
}

function renderRefsInDoc(docs: EditorStructure, doc: EditorDoc) {
  Object.keys(doc).forEach((k: string) => {
    const list = doc[k];
    if (!list || !Array.isArray(list)) return;
    list.forEach(item => {
      if (models.isRef(item)) {
        let otherDoc = docs[item.ref] || {
          title: 'WARNING: No such ref',
        };
        item.label = otherDoc.title || otherDoc.text || otherDoc.link;
      }
    });
  });
}
