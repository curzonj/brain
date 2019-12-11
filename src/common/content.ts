import * as models from './models';
import { ComplexError } from './errors';
import { LevelDB } from './leveldb';
//import { eachOfLimit } from 'async';
import { eachOfLimit } from './eachOfLimit';
import debug from './debug';
import { reportError } from './errors';

const topicStartKey = '$/topics/';
const topicEndKey = '$/topics/\ufff0';

export function deriveTitle(n: models.Topic): string {
  if (!n) return 'Missing Page';
  return n.title || n.link || 'Note';
}

export function notesSorter(
  p1: models.Payload,
  p2: models.Payload
): -1 | 0 | 1 {
  const { metadata: a } = p1;
  const { metadata: b } = p2;
  if (!a || !a.created_at || !b || !b.created_at) {
    debug.warning("invalid payloads: %O %O", p1, p2);
    return 0;
  }
  if (a.created_at > b.created_at) return -1;
  if (a.created_at < b.created_at) return 1;
  return 0;
}

interface PartialRef {
  ref?: string;
}
export function refSorter(a: PartialRef, b: PartialRef): number {
  if (!a.ref) return -1;
  if (!b.ref) return 1;
  if (a.ref < b.ref) return -1;
  if (a.ref > b.ref) return 1;
  return 0;
}

export interface Backrefs {
  notes?: models.Payload[];
  backrefs?: models.Payload[];
  quotes?: models.Payload[];
  tasks?: models.Payload[];
}
export type BackrefKey = keyof Backrefs;
export function buildBackrefs(k: string, v: models.Payload[]): Backrefs {
  const bucketed: Backrefs = v.reduce(
    (acc: Backrefs, payload: models.Payload): Backrefs => {
      const bucket = backrefType(k, payload.topic);
      const list: models.Payload[] = (acc[bucket] = acc[bucket] || []);
      list.push(payload);
      return acc;
    },
    {} as Backrefs
  );

  if (bucketed.notes) {
    bucketed.notes = bucketed.notes.sort(notesSorter);
  }
  if (bucketed.tasks) {
    bucketed.tasks = orderTaskList(bucketed.tasks);
  }

  return bucketed;
}

function backrefType(targetId: string, topic: models.Topic): BackrefKey {
  if (models.hasRef(topic.actionOn, targetId)) {
    return 'tasks';
  } else if (topic.title === undefined && !models.isRef(topic.src)) {
    return 'notes';
  } else if (models.isRef(topic.src) && topic.src.ref === targetId) {
    return 'quotes';
  } else {
    return 'backrefs';
  }
}

function appendTaskChain(
  sorted: models.Payload[],
  p: models.Payload,
  tasks: models.Payload[]
) {
  sorted.push(p);
  const nextAction = p.metadata.nextAction;
  if (nextAction) {
    const nextPayload = tasks.find(t => t.metadata.id === nextAction.ref);
    if (!nextPayload) {
      throw new ComplexError('broken task chain', {
        currentLink: p,
        availableTasks: tasks,
      });
    }
    appendTaskChain(sorted, nextPayload, tasks);
  }
}

export function orderTaskList(tasks: models.Payload[]): models.Payload[] {
  const sorted: models.Payload[] = [];
  const first = tasks.find(t => t.metadata.firstAction);
  if (first) appendTaskChain(sorted, first, tasks);

  // This ensures that the editor shows any task items that don't have
  // ordering information, it just shows them last.
  tasks.forEach(t => {
    if (sorted.indexOf(t) === -1) sorted.push(t);
  });

  return sorted;
}

export async function getLastSeq(
  leveldb: LevelDB
): Promise<number | string | undefined> {
  const ret = await leveldb.configs
    .get('lastSeq')
    .catch((err: Error) => undefined);
  debug.storage('lastSeq=%s', ret);
  return ret;
}

export async function updateLevelDB(
  leveldb: LevelDB,
  sourceDb: PouchDB.Database,
  outerLastSeq: string | number
): Promise<void> {
  const inner = async (lastSeq: string | number) => {
    const { last_seq: resultLastSeq, results } = await sourceDb.changes<
      models.Payload
    >({
      include_docs: true,
      since: lastSeq,
      limit: 200,
      batch_size: 200,
    });
    debug.network(
      'pouchdb.changes count=%s seq=%s',
      results.length,
      resultLastSeq
    );

    await eachOfLimit(results, 30, async (change, i) => {
      if ((i as number) % 100 === 0)
        debug.storage('topics.putOrDel progress=%s', i);
      if (change.deleted) {
        await leveldb.topics.del(lastSlashItem(change.id));
      } else if (change.doc && change.doc.metadata) {
        await leveldb.topics.put(lastSlashItem(change.id), change.doc);
      }
    });

    await leveldb.configs.put('lastSeq', resultLastSeq);
    if (results.length > 0)
      await leveldb.write();

    return { results: results.length, seq: resultLastSeq };
  };

  const following = async ({
    results,
    seq,
  }: {
    results: number;
    seq: string | number;
  }): Promise<void> => {
    if (results > 0) {
      return inner(seq).then(following);
    }
  };

  return inner(outerLastSeq).then(following);
}

export async function getAllDocs(sourceDb: PouchDB.Database) {
  debug.network('getAllDocs at=start');
  const ret = await sourceDb.allDocs<models.Payload>({
    include_docs: true,
    update_seq: true,
    startkey: topicStartKey,
    endkey: topicEndKey,
  });
  debug.network('getAllDocs at=finish count=%s', ret.rows.length);
  return ret;
}

export async function importTopicsToLevelDB(
  leveldb: LevelDB,
  sourceDb: PouchDB.Database
) {
  const { rows, update_seq: resultSequence } = await getAllDocs(sourceDb);

  await eachOfLimit(rows, 30, async (row, i) => {
    try {
      const { doc } = row;
      if ((i as number) % 100 === 0) debug.storage('topics.put progress=%s', i);
      if (doc) {
        debug.trace('topics.Put at=start index=%s id=%s', i, doc.metadata.id);
        await leveldb.topics.put(doc.metadata.id, doc, {
          freshIndexes: true,
        });
        debug.trace('topics.Put at=finish index=%s id=%s', i, doc.metadata.id);
      }
    } catch (e) {
      reportError(e);
      throw e;
    }
  });

  await leveldb.configs.put('lastSeq', resultSequence);
  await leveldb.write();
}

function lastSlashItem(docId: string) {
  return reverseSlashes(docId)[0];
}

function reverseSlashes(v: string) {
  return v.split('/').reverse();
}
