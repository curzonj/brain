import { spawn } from 'child_process';
import { deepEqual } from 'fast-equals';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as tmp from 'tmp';
import { pick, omit, cloneDeep } from 'lodash';
import cuid from 'cuid';

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

interface RelationshipChange {
  op: 'add'|'remove';
  field: 'notes';
  target: string;
  topicId: string;
}

// tag: specialAttributes
function computeDerivedRelationshipChanges(changedKeys: string[], contentList: models.Map<models.EditorTopic>, newContentList: models.Map<models.EditorTopic>, ): RelationshipChange[] {
  return changedKeys.flatMap((k: string): RelationshipChange[] => {
    const newTopicContent = newContentList[k];
    const newNotes = newTopicContent.notes || [];

    const previousContent = contentList[k] || {};
    const justRefNotes = newNotes.filter(models.isRef);
    const oldNotes = (previousContent.notes || []).filter(models.isRef);
    const added = findMissingRefs(justRefNotes, oldNotes);
    const removed = findMissingRefs(oldNotes, justRefNotes);

    // I now realize that some notes are mapped via the `related` and other fields
    return [
      added.map(({ref}): RelationshipChange => ({ op: "add", field: "notes", target: k, topicId: ref })),

      removed.map(({ref}): RelationshipChange => ({ op: "remove", field: "notes", target: k, topicId: ref })),
    ].flat();
  });

}

async function computeChangesFromKey(db: DB, k: string, newContent: models.EditorTopic) {
  const docId = topicToDocID(k);
  const oldDoc = await db
    .get(docId)
    // tag: specialAttributes
    .catch(() => ({
      _id: docId,
      metadata: { id: k, created_at: Date.now() },
    }));

  const docEntries: models.Update[] = [];
  const newPayload: models.Update = {
    // We clone because otherwise both objects are actually using
    // the same metadata object and updates to it impact both and
    // prevent us from diffing them to detect updates
    ...cloneDeep(pick(oldDoc, ['_id', '_rev', 'metadata'])),
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
}

function updateKeyForDerivedChanges(topicId: string, topic: models.EditorTopic, changes: RelationshipChange[], newContentList: models.Map<models.EditorTopic>) {
  let list = topic.broader || [];
  changes.forEach(change => {
    if (change.op === 'remove') {
      const target = newContentList[change.target];
      const allRefs = models.getAllRefs(target);
      // If the target still has a ref to the topic don't remove
      // it's relationship
      if (target && models.hasRef(allRefs, topicId)) return;
      list = list.filter(r => r.ref !== change.target);
    } else if (change.op === 'add') {
      if (!models.hasRef(list, change.target)) list.push({ ref: change.target });
    }
  });

  // If the topic was removed from everything then it is stale and the
	// relationships are still valid
  if (list.length > 0) {
    topic.broader = list;
  } else {
    topic.stale = true;
  }

  // removed from notes
  // removed from notes and added to a static list
  // removed from notes and added to tasks
  // removed from notes and added to notes on another topic
}

async function computeUpdates(
  contentList: models.Map<models.EditorTopic>,
  newContentList: models.Map<models.EditorTopic>
) {
  const db = await getDB();
  const changedKeys = Object.keys(newContentList).filter(
    k => !contentList[k] || !deepEqual(contentList[k], newContentList[k])
  );

  const derivedChanges = computeDerivedRelationshipChanges(changedKeys, contentList, newContentList);
  groupBy(derivedChanges, c => c.topicId).forEach(([topicId, changes]) => {
    const newTopicContent = newContentList[topicId]
    if (newTopicContent) {
      if (changedKeys.indexOf(topicId) === -1) changedKeys.push(topicId);
      updateKeyForDerivedChanges(topicId, newTopicContent, changes, newContentList);
    } else {
      throw new ComplexError("invalid derived change ref", {
        topicId,
        changes,
      });
    }
  });

  return (await Promise.all(
    changedKeys.map(async k => computeChangesFromKey(db, k, newContentList[k]))
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
    'tasks',
    'notes',
    'backrefs',
    'quotes',
  ]) as models.Topic;

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
