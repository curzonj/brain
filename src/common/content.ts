import * as models from './models';
import { ComplexError } from './errors';

export function deriveTitle(n: models.Topic): string {
  if (!n) return 'Missing Page';
  return n.title || n.link || 'Note';
}

function notesSorter(
  { metadata: a }: models.Payload,
  { metadata: b }: models.Payload
): -1 | 0 | 1 {
  if (!a.created_at || !b.created_at) return 0;
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
