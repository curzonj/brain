import { spawn } from 'child_process';
import { deepEqual } from 'fast-equals';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as tmp from 'tmp';
import { pick, omit, cloneDeep } from 'lodash';
import cuid from 'cuid';
import { debug as debugLib } from 'debug';

import {
  applyChanges,
  topicToDocID,
  findMissingReferences,
  getAllDocsHash,
  buildReverseMappings,
} from './content';
import { getDB, DB } from './db';
import { ComplexError } from '../common/errors';
import * as models from '../common/models';
import { buildBackrefs, BackrefKey } from '../common/content';
import { schemaSelector } from './schema';
import { groupBy } from './groupBy';

const debug = debugLib('kbase:editor');
const editorSchema = schemaSelector('editor');

type editFileResult =
  | { content: models.Map<EditorTopic>; changed: boolean }
  | undefined;
type resolveFunc = (value: editFileResult | Promise<editFileResult>) => void;
type rejectFunc = (error: Error) => void;
type invalidResultHandler = (
  err: any,
  originalInput: string,
  editorContents: string
) => Promise<editFileResult>;

interface UpdateWithTasks {
  changed: boolean;
  update: models.Update;
  tasks?: models.Ref[];
}
interface TopicWithTasks {
  topic: models.Topic;
  tasks?: models.Ref[];
}

export type EditorRefInput = models.Ref | string | EditorTopic;
export interface EditorTopic extends models.TopicFields {
  stale?: true;
  collection?: EditorRefInput[];
  notes?: EditorRefInput[];
  tasks?: EditorRefInput[];
  backrefs?: models.Ref[];
  quotes?: models.Ref[];
}

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
  content: models.Map<EditorTopic>,
  newContent: models.Map<EditorTopic>
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

interface RelationshipChange {
  op: 'add' | 'remove';
  field: 'broader' | 'actionOn';
  target: string;
  topicId: string;
}

// tag: specialAttributes
// TODO I now realize that some notes are mapped via the `related`
// and other fields but that should be corrected, notes should
// always have a broader relationship with the thing they comment on.
function computeDerivedRelationshipChanges(
  changedKeys: string[],
  contentList: models.Map<EditorTopic>,
  newContentList: models.Map<EditorTopic>
): RelationshipChange[] {
  function forField(
    dField: 'notes' | 'tasks',
    field: 'broader' | 'actionOn',
    k: string
  ) {
    const newRefs = (newContentList[k][dField] || []).filter(models.isRef);
    const oldRefs = ((contentList[k] || {})[dField] || []).filter(models.isRef);

    function buildChanges(op: 'add' | 'remove', list: models.Ref[]) {
      return list.map(
        ({ ref }): RelationshipChange => ({
          op,
          field,
          target: k,
          topicId: ref,
        })
      );
    }

    return [
      buildChanges('add', findMissingRefs(newRefs, oldRefs)),
      buildChanges('remove', findMissingRefs(oldRefs, newRefs)),
    ].flat();
  }
  return changedKeys.flatMap((k: string): RelationshipChange[] => {
    return [
      forField('notes', 'broader', k),
      forField('tasks', 'actionOn', k),
    ].flat();
  });
}

async function computeChangesFromKey(
  db: DB,
  k: string,
  newContent: EditorTopic,
  acc: models.Map<UpdateWithTasks>,
  customMetadata?: Partial<models.TopicMetadata>
) {
  const docId = topicToDocID(k);
  const oldDoc = await db
    .get(docId)
    // tag: specialAttributes
    .catch(() => ({
      _id: docId,
      metadata: { id: k, created_at: Date.now() },
    }));

  const decomposed = decomposeEditorTopic(k, newContent, acc);
  const newPayload: models.Update = {
    ...pick(oldDoc, ['_id', '_rev']),
    metadata: cloneDeep(oldDoc.metadata),
    topic: decomposed.topic,
  };

  if (customMetadata) Object.assign(newPayload.metadata, customMetadata);

  // tag: specialAttributes
  if (oldDoc.metadata.stale_at === undefined && newContent.stale === true)
    newPayload.metadata.stale_at = Date.now();

  // tag: specialAttributes
  if (newContent.text && !newPayload.metadata.created_at) {
    newPayload.metadata.created_at = Date.now();
  }

  acc[k] = {
    changed: !deepEqual(oldDoc, newPayload),
    update: newPayload,
    tasks: decomposed.tasks,
  };
}

function updateKeyForDerivedChanges(
  topicId: string,
  topic: EditorTopic,
  changes: RelationshipChange[],
  newContentList: models.Map<EditorTopic>
) {
  const flagStale =
    // If we add this note back to any other dynamic lists then the intention
    // was a move. If we are just removing it from places then it's because
    // it's stale. If you want to clean up relationships from a multi-related
    // note, do it on the note. Later I'll need to expose that information
    // in the ref objects. TODO
    changes.every(c => c.op === 'remove') &&
    changes.every(change => {
      const target = newContentList[change.target];
      // If the topic for a note was deleted, the note doesn't get marked
      // stale, the relationship gets removed and it will likely create
      // a validation error if that leaves the note without any broader
      // relationships. The most likely case is that everything was corrected
      // manually and this will resolve as a NoOp.
      if (!target) return false;
      const allRefs = models.getAllRefs(target);
      // If the target still has a ref to this note, don't mark it stale,
      // just remove the broader relationship
      if (models.hasRef(allRefs, topicId)) return false;
      return true;
    });
  if (flagStale) {
    topic.stale = true;
    return;
  }
  changes.forEach(change => {
    let list: models.Ref[] = topic[change.field] || [];
    if (change.op === 'remove') {
      list = list.filter(r => r.ref !== change.target);
    } else if (change.op === 'add') {
      if (!models.hasRef(list, change.target))
        list.push({ ref: change.target });
    }
    if (list.length > 0) {
      topic[change.field] = list;
    } else {
      delete topic[change.field];
    }
  });
}

async function computeUpdates(
  contentList: models.Map<EditorTopic>,
  newContentList: models.Map<EditorTopic>
) {
  const db = await getDB();
  const changedKeys = Object.keys(newContentList).filter(
    k => !contentList[k] || !deepEqual(contentList[k], newContentList[k])
  );

  debug('changedKeys %O', changedKeys);

  const derivedChanges = computeDerivedRelationshipChanges(
    changedKeys,
    contentList,
    newContentList
  );
  debug('derivedChanges %O', derivedChanges);
  groupBy(derivedChanges, c => c.topicId).forEach(([topicId, changes]) => {
    const newTopicContent = newContentList[topicId];
    if (newTopicContent) {
      if (changedKeys.indexOf(topicId) === -1) changedKeys.push(topicId);
      updateKeyForDerivedChanges(
        topicId,
        newTopicContent,
        changes,
        newContentList
      );
    } else {
      throw new ComplexError('invalid derived change ref', {
        topicId,
        changes,
      });
    }
  });

  const newPayloads: models.Map<UpdateWithTasks> = await changedKeys.reduce(
    async (
      p: Promise<models.Map<UpdateWithTasks>>,
      id: string
    ): Promise<models.Map<UpdateWithTasks>> => {
      const acc = await p;
      await computeChangesFromKey(db, id, newContentList[id], acc);
      return acc;
    },
    Promise.resolve({} as models.Map<UpdateWithTasks>)
  );

  await updateTaskMetadata(db, newPayloads, newContentList);
  return Object.values(newPayloads)
    .filter(p => p.changed)
    .map(p => p.update);
}

async function updateTaskMetadata(db: DB, newPayloads: models.Map<UpdateWithTasks>, newContentList: models.Map<EditorTopic>) {
  await Promise.all(
    Object.keys(newPayloads).map(async targetId => {
      const newContent = newPayloads[targetId];
      const tasks = newContent.tasks;
      if (!tasks) return;
      await Promise.all(
        tasks.map(async (t, i) => {
          const custom: Partial<models.TopicMetadata> = {
            firstAction: i === 0,
          };
          const next = tasks[i + 1];
          const taskPayload = newPayloads[t.ref];
          if (next) custom.nextAction = pick(next, 'ref');
          if (taskPayload) {
            const { metadata } = taskPayload.update;
            Object.assign(custom, metadata);
            if (!deepEqual(custom, metadata)) {
              debug('assigning custom metadata to %s: %O', t.ref, custom);
              taskPayload.changed = true;
              Object.assign(metadata, custom);
            }
          } else {
            debug('computeChanges for task %s: %O', t.ref, custom);
            await computeChangesFromKey(
              db,
              t.ref,
              newContentList[t.ref],
              newPayloads,
              custom,
            );
          }
        })
      );
    })
  );
}

function decomposeEditorTopic(
  ref: string,
  input: EditorTopic,
  docEntries: models.Map<UpdateWithTasks>
): TopicWithTasks {
  const ret: TopicWithTasks = {
    topic: omit(input, [
      'stale',
      'collection',
      'tasks',
      'notes',
      'backrefs',
      'quotes',
    ]) as models.Topic,
  };

  decompose(
    'broader',
    input.collection,
    collection => (ret.topic.collection = collection)
  );
  decompose('broader', input.notes);
  decompose('actionOn', input.tasks, tasks => (ret.tasks = tasks));

  return ret;

  function decompose(
    field: 'broader' | 'actionOn',
    list: undefined | EditorRefInput[],
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
              [field]: [{ ref }],
              text: item,
            };
          } else {
            item[field] = [{ ref }];
            topic = decomposeEditorTopic(id, item, docEntries).topic;
          }

          const nestedPayload: models.Update = {
            _id: topicToDocID(id),
            metadata: {
              id,
              created_at: Date.now(),
            },
            topic,
          };

          docEntries[id] = { changed: true, update: nestedPayload };

          return { ref: id };
        }
      )
    );
  }
}

export async function applyEditorChanges(
  content: models.Map<EditorTopic>,
  newContent: models.Map<EditorTopic>
) {
  sanitizeRewrites(newContent);
  sanitizeRewrites(content);

  const deletes = await computeDeletions(content, newContent);
  const updates = await computeUpdates(content, newContent);

  await applyChanges(updates, deletes);
}

function findErrors(editorPayload: models.Map<EditorTopic>) {
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
        'tasks',
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

export type Backrefs = Record<BackrefKey, models.Ref[]>;
function buildBackrefsAsRefs(
  targetId: string,
  list: models.Payload[]
): Backrefs {
  const bucketed = buildBackrefs(targetId, list);
  return Object.keys(bucketed).reduce(
    (acc, k) => {
      const payloads = bucketed[k as BackrefKey];
      if (!payloads) return acc;

      let ids = payloads.map(({ metadata }) => metadata.id);
      if (['notes', 'tasks'].indexOf(k) === -1) ids = ids.sort();
      acc[k as BackrefKey] = ids
        .filter((v, i, a) => a.indexOf(v) === i)
        .map((ref): models.Ref => ({ ref }));
      return acc;
    },
    {} as Backrefs
  );
}

function buildSortedReverseMappings(
  allDocs: models.Map<models.Payload>
): Record<string, Backrefs> {
  const reverse = buildReverseMappings(allDocs, true);
  return Object.fromEntries(
    Object.entries(reverse)
      .map(([referencedId, list]): [string, models.Payload[]] => [
        referencedId,
        list.filter(
          ({ metadata: referencingDoc }) =>
            !referencingDoc.stale_at &&
            // This removes any backrefs that are already included in
            // some list field of the referenced doc
            !models.hasRef(reverse[referencingDoc.id], referencedId)
        ),
      ])
      .map(([k, v]) => [k, buildBackrefsAsRefs(k, v)])
  );
}

export async function buildEditorStructure(): Promise<models.Map<EditorTopic>> {
  const allDocs = await getAllDocsHash();
  const allMappings = buildSortedReverseMappings(allDocs);
  const rendered = Object.values(allDocs).reduce(
    (acc: models.Map<EditorTopic>, { metadata, topic: serializedTopic }) => {
      const topic: EditorTopic = serializedTopic;
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

function sanitizeRewrites(result: models.Map<EditorTopic>) {
  Object.values(result).forEach((doc: EditorTopic) =>
    models.getAllRefs(doc).forEach(ref => delete ref.label)
  );
}
