import { spawn } from 'child_process';
import { deepEqual } from 'fast-equals';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as tmp from 'tmp';
import { pick, omit } from 'lodash';
import cuid from 'cuid';

import {
  applyChanges,
  topicToDocID,
  findMissingReferences,
  getAllDocsHash,
  buildReverseMappings,
} from './content';
import { getDB } from './db';
import { ComplexError } from '../common/errors';
import * as models from '../common/models';
import { schemaSelector } from './schema';

const editorSchema = schemaSelector('editor');

type editFileResult =
  | { content: models.Map<models.EditorTopic>; changed: boolean }
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
  content: models.Map<models.EditorTopic>,
  newContent: models.Map<models.EditorTopic>
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

function findMissingRefs(more: models.Ref[], less: models.Ref[]): models.Ref[] {
  return more.filter(i => !less.some(i2 => i2.ref === i.ref));
}

async function computeUpdates(
  contentList: models.Map<models.EditorTopic>,
  newContentList: models.Map<models.EditorTopic>
) {
  const db = await getDB();
  const changedKeys = Object.keys(newContentList).filter(
    k => !contentList[k] || !deepEqual(contentList[k], newContentList[k])
  );

  // tag: specialAttributes
  changedKeys.forEach(k => {
    const newTopicContent = newContentList[k];
    const newNotes = newTopicContent.notes || [];

    const previousContent = contentList[k] || {};
    const allRefs = models.getAllRefs(newTopicContent);
    const justRefNotes = newNotes.filter(models.isRef);
    const oldNotes = (previousContent.notes || []).filter(models.isRef);
    const added = findMissingRefs(justRefNotes, oldNotes);
    const removed = findMissingRefs(
      findMissingRefs(oldNotes, justRefNotes),
      allRefs
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
        if (changedKeys.indexOf(id) === -1) changedKeys.push(id);
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
        // tag: specialAttributes
        .catch(() => ({
          _id: docId,
          metadata: { id: k, created_at: Date.now() },
        }));

      const docEntries: models.Update[] = [];
      const newContent = newContentList[k];
      const newPayload: models.Update = {
        ...pick(oldDoc, ['_id', '_rev', 'metadata']),
        topic: decomposeEditorTopic(k, newContent, docEntries),
      };

      // tag: specialAttributes
      if (oldDoc.metadata.stale_at === undefined && newContent.stale === true)
        newPayload.metadata.stale_at = Date.now();

      // tag: specialAttributes
      if (newContent.text && !newPayload.metadata.created_at) {
        newPayload.metadata.created_at = Date.now();
      }

      if (!deepEqual(oldDoc, newPayload)) docEntries.push(newPayload);

      return docEntries;
    })
  )).flat();
}

function decomposeEditorTopic(
  ref: string,
  input: models.EditorTopic,
  docEntries: models.Update[]
): models.Topic {
  const topic = omit(input, [
    'stale',
    'collection',
    'next',
    'later',
    'notes',
    'backrefs',
    'quotes',
  ]) as models.Topic;

  decompose(input.next, next => (topic.next = next));
  decompose(input.later, later => (topic.later = later));
  decompose(input.collection, collection => (topic.collection = collection));
  decompose(input.notes);

  return topic;

  function decompose(
    list: undefined | models.EditorRefInput[],
    fn: (r: models.Ref[]) => void = () => {}
  ) {
    if (!Array.isArray(list)) return;
    fn(
      list.map(
        (item): models.Ref => {
          if (models.isRef(item)) return item;

          const id = cuid();
          let topic: models.Topic;
          if (typeof item === 'string') {
            topic = {
              broader: [{ ref }],
              text: item,
            };
          } else {
            item.broader = [{ ref }];
            topic = decomposeEditorTopic(id, item, docEntries);
          }

          const nestedPayload: models.Update = {
            _id: topicToDocID(id),
            metadata: {
              id,
              created_at: Date.now(),
            },
            topic,
          };

          docEntries.push(nestedPayload);

          return { ref: id };
        }
      )
    );
  }
}

export async function applyEditorChanges(
  content: models.Map<models.EditorTopic>,
  newContent: models.Map<models.EditorTopic>
) {
  sanitizeRewrites(newContent);
  sanitizeRewrites(content);

  const deletes = await computeDeletions(content, newContent);
  const updates = await computeUpdates(content, newContent);

  await applyChanges(updates, deletes);
}

function findErrors(editorPayload: models.Map<models.EditorTopic>) {
  if (!editorSchema(editorPayload)) {
    return editorSchema.errors;
  }

  const missing = findMissingReferences(
    Object.values(editorPayload),
    editorPayload
  );
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

function buildSortedReverseMappings(
  allDocs: models.Map<models.Payload>
): Record<string, models.ReverseMappings> {
  const reverse = buildReverseMappings(allDocs);
  return Object.fromEntries(
    Object.entries(reverse)
      .map(([referencedId, list]): [string, models.Payload[]] => [
        referencedId,
        list.filter(
          ({ metadata: referencingDoc }) =>
            !referencingDoc.stale_at &&
            // This removes any backrefs that are already included in some list field of the referenced doc
            (!reverse[referencingDoc.id] ||
              !reverse[referencingDoc.id].some(
                ({ metadata }) => metadata.id === referencedId
              ))
        ),
      ])
      .map(([k, v]) => {
        const notes = v
          .filter(
            ({ topic }) =>
              topic.title === undefined &&
              (!models.isRef(topic.src) || topic.src.ref !== k)
          )
          .sort(({ metadata: a }, { metadata: b }) => {
            if (!a.created_at || !b.created_at) return 0;
            if (a.created_at > b.created_at) return -1;
            if (a.created_at < b.created_at) return 1;
            return 0;
          })
          .map(({ metadata }) => metadata.id)
          .map(ref => ({ ref }));
        const quotes = v
          .filter(({ topic }) => models.isRef(topic.src) && topic.src.ref === k)
          .map(({ metadata }) => metadata.id)
          .sort()
          .map(ref => ({ ref }));
        const backrefs = v
          .filter(({ topic }) => topic.title !== undefined)
          .map(({ metadata }) => metadata.id)
          .sort()
          .map(ref => ({ ref }));

        const ret: models.ReverseMappings = {};
        if (notes.length > 0) ret.notes = notes;
        if (quotes.length > 0) ret.quotes = quotes;
        if (backrefs.length > 0) ret.backrefs = backrefs;

        return [k, ret];
      })
  );
}

export async function buildEditorStructure(): Promise<
  models.Map<models.EditorTopic>
> {
  const allDocs = await getAllDocsHash();
  const allMappings = buildSortedReverseMappings(allDocs);
  const rendered = Object.values(allDocs).reduce(
    (
      acc: models.Map<models.EditorTopic>,
      { metadata, topic: serializedTopic }
    ) => {
      const topic: models.EditorTopic = serializedTopic;
      const backrefs = allMappings[metadata.id];
      if (backrefs) Object.assign(topic, backrefs);

      // tag: specialAttributes
      if (metadata.stale_at !== undefined) {
        topic.stale = true;
      }

      models.getAllRefs(topic).forEach(ref => {
        const { topic: otherDoc } = allDocs[ref.ref] || {
          topic: {
            title: 'WARNING: No such ref',
          },
        };
        ref.label = otherDoc.title || otherDoc.text || otherDoc.link;
      });

      acc[metadata.id] = topic;

      return acc;
    },
    {}
  );

  if (!editorSchema(rendered)) {
    console.dir(editorSchema.errors);
    throw new Error('rendered content for editor is invalid');
  }

  return rendered;
}

function sanitizeRewrites(result: models.Map<models.EditorTopic>) {
  Object.values(result).forEach((doc: models.EditorTopic) =>
    models.getAllRefs(doc).forEach(ref => delete ref.label)
  );
}
