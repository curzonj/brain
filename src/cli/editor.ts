import { spawn } from "child_process";
import cuid from "cuid";
import { deepEqual } from "fast-equals";
import * as fs from "fs";
import * as yaml from "js-yaml";
import * as tmp from "tmp";

import { timingAsync, timingSync } from './timing';
import { applyChanges, topicToDocID } from "./content";
import { getDB } from "./db";
import { ComplexError } from "./errors";
import * as models from "./models";
import { EditorDoc, EditorStructure, EditorValueTypes, LabeledRef, MaybeLabeledRef, RefList } from "./models";
import { schemaSelector } from "./schema";

const editorSchema = schemaSelector("editor");

type editFileResult = { content: EditorStructure, changed: boolean } | undefined;
type resolveFunc = (value: editFileResult | Promise<editFileResult>) => void;
type rejectFunc = (error: Error) => void;
type invalidResultHandler = (err: any, originalInput: string, editorContents: string) => Promise<editFileResult>;

export function editFile(
  input: string,
  onInvalidResult: invalidResultHandler,
  originalInput?: string,
): Promise<editFileResult> {
  return new Promise((resolve, reject) => {
    try {
      const file = tmp.fileSync({ postfix: ".yml" });
      fs.writeSync(file.fd, input);
      fs.closeSync(file.fd);

      spawn(process.env.EDITOR || "vim", [file.name], { stdio: "inherit" }).on(
        "exit",
        () => onEditorExit(file, originalInput || input, onInvalidResult, resolve, reject),
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
  reject: rejectFunc,
) {
  let editorContents;
  try {
    editorContents = fs.readFileSync(file.name).toString();
    file.removeCallback();
  } catch (err) {
    reject(err);
    return;
  }

  if (editorContents.trim() === "") {
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
  return k !== "links" && k !== "patches" && Array.isArray(v);
}

function isRefObject(v: MaybeLabeledRef): v is LabeledRef {
  if (typeof v === "string") {
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
  Object.values(result).forEach((doc) => {
    Object.keys(doc).forEach((k: string) => {
      const list = doc[k];

      if (isRefList(k, list)) {
         doc[k] = (list as RefList).map(dereferenceValue);
      }
    });
  });
}

async function computeDeletions(content: EditorStructure, newContent: EditorStructure ) {
  const db = await getDB();

  return Promise.all(
    Object.keys(content)
      .filter((k) => newContent[k] === undefined)
      .map(async (k) => {
        try {
          return  db.get(topicToDocID(`/${k}`));
        } catch (e) {
          throw new ComplexError("Problem fetching deleted document", {
            cause: e,
            key: k,
            content: content[k],
          });
        }
      }),
  );
}

async function computeUpdates(content: EditorStructure, newContent: EditorStructure ) {
  const db = await getDB();

  return Promise.all(
    Object.keys(newContent)
      .filter((k) => !content[k] || !deepEqual(content[k], newContent[k]))
      .map(async (k) => {
        const slashId = `/${k}`;
        const docId = topicToDocID(slashId);
        const { _rev, created_at } = await db
          .get(docId)
          .catch(() => ({ created_at: Date.now() }));
        const patches = diffToDocChanges(content[k], newContent[k]);

        const docEntries = [] as models.DocUpdate[];
        const newTopicContent = {
          _id: docId,
          _rev,
          created_at,
          id: slashId,
          patches,
          ...newContent[k],
        } as models.DocUpdate;

        unstackNestedDocuments(newTopicContent, docEntries);
        docEntries.push(newTopicContent);

        return docEntries;
      }),
  );
}

function diffToDocChanges(orig: EditorDoc, doc: EditorDoc) {
  const list = [] as models.DocChangeEntry[];

  Object.keys(orig).forEach((k: string) => {
    if (!doc[k]) {
      const value = orig[k] as models.RegularDocValueTypes;
      if (models.isPatches(k, value)) {
        return;
      } else if (models.isDocArrayField(k, value)) {
        value.forEach((v: models.Link) => {
          list.push({
            op: "remove",
            field: k,
            value: v,
          } as models.DocChangeEntry);
        });
      } else {
        list.push({
          op: "remove",
          field: k,
          value,
        } as models.DocChangeEntry);
      }
    }
  });

  Object.keys(doc).forEach((k: string) => {
    const origValue = orig[k] as models.RegularDocValueTypes;
    const newValue = doc[k] as models.RegularDocValueTypes;

    if (
      (Array.isArray(newValue)) &&
      (Array.isArray(origValue) || origValue === undefined)
    ) {
      missingItemsToOps(origValue || [], newValue, "remove", k, list);
      missingItemsToOps(newValue, origValue || [], "add", k, list);
    } else {
      if (origValue) {
        list.push({
          op: "remove",
          field: k,
          value: origValue,
        } as models.DocChangeEntry);
      }

      list.push({
        op: "add",
        field: k,
        value: newValue,
      } as models.DocChangeEntry);
    }
  });

  const invalid = list.filter((e) => !e.value || typeof e.value !== "string");
  if (invalid.length > 0) {
    throw new ComplexError("generated invalid patches", {
      orig,
      doc,
      invalid,
    });
  }

  return list;
}

function missingItemsToOps(
  l1: models.LinkList,
  l2: models.LinkList,
  op: "remove" | "add",
  field: string,
  list: models.DocChangeEntry[],
) {
  findMissingItems(l1, l2).forEach((value: models.Link) => {
    if (typeof value === "string") {
      list.push({
        op,
        field,
        value,
      } as models.DocChangeEntry);
    } else if(models.isLabeledLink(value)) {
      list.push({
        op,
        field,
        value: value.link,
      } as models.DocChangeEntry);
    } else {
      // TODO implement
      throw new ComplexError("unable to generate a patch for object", {
        op,
        field,
        value,
      });
    }
  });
}

function findMissingItems<T>(l1: T[], l2: T[]): T[] {
  return l1.filter((i: T) => l2.indexOf(i) === -1);
}

export async function applyEditorChanges(content: EditorStructure, newContent: EditorStructure ) {
  sanitizeRewrites(newContent);
  sanitizeRewrites(content);

  const deletes = await computeDeletions(content, newContent);
  const nestedUpdates = await computeUpdates(content, newContent);
  const updates: models.DocUpdate[] = nestedUpdates.flat();

  await applyChanges(updates, deletes);
}

function unstackNestedDocuments(doc: models.DocUpdate, docEntries: models.DocUpdate[]) {
  if (Array.isArray(doc.queue)) {
    doc.queue = doc.queue.map((q) => {
      if (q.startsWith && q.startsWith("/")) {
        return q;
      }

      const newId = `/${cuid()}`;
      const newQueueTopic = {
        _id: topicToDocID(newId),
        id: newId,
        context: doc.id,
        created_at: Date.now(),
      } as models.DocUpdate;

      if (q.startsWith) {
        newQueueTopic.text = q;
      } else {
        Object.assign(newQueueTopic, q);
        unstackNestedDocuments(newQueueTopic, docEntries);
      }

      docEntries.push(newQueueTopic);

      return newQueueTopic.id;
    });
  }
}

function findErrors(doc: EditorStructure) {
  if (!editorSchema(doc)) {
    return editorSchema.errors;
  }

  const missing = findMissing(doc);
  if (missing.length > 0) {
    return [{ missing }];
  }

  return undefined;
}

function findMissing(doc: EditorStructure) {
  return Object.keys(doc).flatMap((topicKey) => {
    const topic = doc[topicKey];

    return Object.keys(topic).flatMap((k) => {
      if (k === "links") {
        return [];
      }
      if (k === "props") {
        return [];
      }
      const value = [topic[k]].flat();
      return value
        .filter((s) => s.startsWith && s.startsWith("/"))
        .filter((s) => !doc[s.slice(1)]);
    });
  });
}

export function sortedYamlDump(input: object): string {
  return yaml.safeDump(input, {
    sortKeys(a, b) {
      const fieldOrder = [
        "context",
        "title",
        "type",
        "link",
        "label",
        "ref",
        "aka",
        "text",
        "src",
        "props",
        "next",
        "later",
        "related",
        "mentions",
        "links",
        "list",
        "embedded",
        "queue",
      ];

      for (const name of fieldOrder) {
        if (a === name) {
          return -1;
        }
        if (b === name) {
          return 1;
        }
      }

      if (a > b) { return 1; }
      return a < b ? -1 : 0;
    },
  });
}

export async function buildEditorStructure(): Promise<EditorStructure> {
  const db = await timingAsync('getDB', () => getDB());
  const { rows } = await timingAsync('allDocs(topics)', () => 
    db.allDocs<models.ExistingDoc>({
      include_docs: true,
      startkey: "$/topics/",
      endkey: "$/topics/\ufff0",
    })
  );

  const rendered = timingSync('removeStorageAttributesLoop', () => rows.reduce((acc, { doc }) => {
    if (!doc) {
      return acc;
    }

    const id = doc.id.slice(1);
    acc[id] = models.removeStorageAttributes(doc) as EditorDoc;
    return acc;
  }, {} as Record<string, EditorDoc>));

  finalizeEditorStructure(rendered);

  return rendered;
}

export function finalizeEditorStructure(rendered: EditorStructure) {
  timingSync('sortArrayFields', () => sortArrayFields(rendered));
  timingSync('labelAllRefs', () => labelAllRefs(rendered));
}

function sortArrayFields(rendered: EditorStructure) {
  Object.values(rendered).forEach((doc: EditorDoc) => {
    Object.keys(doc).forEach((k) => {
      const v = doc[k];

      if (Array.isArray(v)) {
        function docValueString(l: models.EditorArrayItemTypes): string {
          if (!l) {
            return "undefined";
          }

          if (typeof l === "string") {
            return l;
          }

          if (models.isSearchLink(l)) {
            return l.search;
          }

          if (models.isLabeledLink(l)) {
            return l.link;
          }

          if (models.isLabeledRef(l)) {
            return l.ref;
          }

          return "unknown";
        }
        doc[k] = v.sort((a: models.EditorArrayItemTypes,b: models.EditorArrayItemTypes): number => {
          const an = docValueString(a);
          const bn = docValueString(b);

          if (an < bn) {
            return -1;
          }
          if (an > bn) {
            return 1;
          }
          return 0;
        });
      }
    });
  });
}

function labelAllRefs(rendered: EditorStructure) {
  Object.values(rendered).forEach((doc: EditorDoc) => {
    Object.keys(doc).forEach((k) => renderRefsInDoc(rendered, doc, k));
  });
}

function renderRefsInDoc(docs: EditorStructure, doc: EditorDoc, k: string) {
  const list = doc[k];

  if (isRefList(k, list)) {
    doc[k] = (list as RefList).map((v: MaybeLabeledRef): MaybeLabeledRef => {
      if (isRefObject(v)) {
        return v;
      } else if (!v.startsWith("/")) {
        // Not all items in lists are refs
        return v;
      } else {
        const otherDoc = docs[v.slice(1)];
        if (!otherDoc) {
          throw new ComplexError("missing ref", {
            ref: v.slice(1),
          });
        }
        return {
          label:
            otherDoc.title ||
            otherDoc.join ||
            otherDoc.text ||
            otherDoc.link,
          ref: v,
        } as LabeledRef;
      }
    });
  }
}
