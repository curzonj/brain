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
import {
  EditorDoc,
  EditorStructure,
  EditorValueTypes,
  LabeledRef,
  MaybeLabeledRef,
  RefList,
} from '../common/models';
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

function isRefList(k: string, v: EditorValueTypes): v is RefList {
  return k !== 'links' && Array.isArray(v);
}

function isRefObject(v: MaybeLabeledRef): v is LabeledRef {
  if (typeof v === 'string') {
    return false;
  }

  return v.ref !== undefined && v.label !== undefined;
}

function dereferenceValue(v: string | LabeledRef): string {
  if (isRefObject(v)) {
    return v.ref;
  } else {
    return v;
  }
}

function sanitizeRewrites(result: EditorStructure) {
  Object.values(result).forEach(doc => {
    Object.keys(doc).forEach((k: string) => {
      const list = doc[k];

      if (isRefList(k, list)) {
        doc[k] = (list as RefList).map(dereferenceValue);
      }
    });
  });
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
          return db.get(topicToDocID(`/${k}`));
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

async function computeUpdates(
  contentList: EditorStructure,
  newContentList: EditorStructure
) {
  const db = await getDB();

  return Promise.all(
    Object.keys(newContentList)
      .filter(
        k => !contentList[k] || !deepEqual(contentList[k], newContentList[k])
      )
      .map(async k => {
        const slashId = `/${k}`;
        const docId = topicToDocID(slashId);
        const oldDoc = await db
          .get(docId)
          .catch(() => ({ created_at: Date.now() }));

        const newContent = newContentList[k];

        // tag: specialAttributes
        if (oldDoc.stale_at === undefined && newContent.stale === true)
          newContent.stale_at = Date.now();
        delete newContent.stale;

        // tag: specialAttributes
        delete newContent.notes;
        delete newContent.backrefs;

        const newTopicContent = {
          id: slashId,
          // tag: specialAttributes
          ...pick(oldDoc, ['_id', '_rev', 'created_at']),
          ...newContent,
        } as models.DocUpdate;

        // tag: specialAttributes
        if (!newTopicContent.text) {
          delete newTopicContent.created_at;
        }

        const docEntries = [] as models.DocUpdate[];
        unstackNestedDocuments(newTopicContent, docEntries);
        docEntries.push(newTopicContent);

        return docEntries;
      })
  );
}

export async function applyEditorChanges(
  content: EditorStructure,
  newContent: EditorStructure
) {
  sanitizeRewrites(newContent);
  sanitizeRewrites(content);

  const deletes = await computeDeletions(content, newContent);
  const nestedUpdates = await computeUpdates(content, newContent);
  const updates: models.DocUpdate[] = nestedUpdates.flat();

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
        'links',
        'list',
        'embedded',
        'queue',
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

function buildSortedReverseMappings(
  allDocs: models.AllDocsHash
): Record<string, { notes?: string[]; backrefs?: string[] }> {
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
          .filter(d => d.title === undefined)
          .sort((a, b) => {
            if (!a.created_at || !b.created_at) return 0;
            if (a.created_at > b.created_at) return -1;
            if (a.created_at < b.created_at) return 1;
            return 0;
          })
          .map(d => d.id);
        const backrefs = v
          .filter(d => d.title !== undefined)
          .map(d => d.id)
          .sort();

        const ret = {} as any;
        if (notes.length > 0) ret.notes = notes;
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
      const id = doc.id.slice(1);
      const shortDoc = models.removeStorageAttributes(doc) as EditorDoc;

      // tag: specialAttributes
      delete shortDoc.created_at;

      // tag: specialAttributes
      const backrefs = allMappings[doc.id];
      if (backrefs) Object.assign(shortDoc, backrefs);

      acc[id] = shortDoc;

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

export function finalizeEditorStructure(rendered: EditorStructure) {
  Object.values(rendered).forEach((doc: EditorDoc) => {
    // tag: specialAttributes
    if (doc.stale_at !== undefined) {
      doc.stale = true;
      delete doc.stale_at;
    }

    Object.keys(doc).forEach(k => renderRefsInDoc(rendered, doc, k));
  });
}

function renderRefsInDoc(docs: EditorStructure, doc: EditorDoc, k: string) {
  const list = doc[k];

  if (isRefList(k, list)) {
    doc[k] = (list as RefList).map(
      (v: MaybeLabeledRef): MaybeLabeledRef => {
        if (isRefObject(v)) {
          return v;
        } else if (typeof v !== 'string') {
          throw new ComplexError('invalid ref', {
            v,
          });
        } else if (!v.startsWith('/')) {
          // Not all items in lists are refs
          return v;
        } else {
          const otherDoc = docs[v.slice(1)];
          if (!otherDoc) {
            console.log(`Warning: invalid ref ${v} on ${doc.id}`);
            return {
              label: 'WARNING: No such ref',
              ref: v,
            };
          }
          return {
            label: otherDoc.title || otherDoc.text || otherDoc.link,
            ref: v,
          } as LabeledRef;
        }
      }
    );
  }
}
