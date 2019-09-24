import { Command } from '@oclif/command';
import cuid from 'cuid';

import {
  applyChanges,
  dumpJSON,
  topicToDocID,
  generatePatches,
} from '../cli/content';
import { getDB, remote } from '../cli/db';
import * as models from '../common/models';
import { groupBy } from '../cli/groupBy';

class SyncCommand extends Command {
  public async run() {
    console.log('Syncing files up to couchdb and queue down to git...');

    const db = await getDB();

    await db.replicate.from(remote);
    await importQueues();
    await db.replicate.to(remote);
    await dumpJSON();
  }
}

SyncCommand.description = `Replicates CouchDB and reconciles updates`;

SyncCommand.flags = {};

module.exports = SyncCommand;

async function importQueues(): Promise<void> {
  const db = await getDB();

  const response = await db.allDocs<models.ExistingDoc>({
    include_docs: true,
    startkey: '$/queue/',
    endkey: '$/queue/\ufff0',
  });

  const docs: models.ExistingDoc[] = response.rows
    .map(r => r.doc)
    .filter((doc): doc is models.ExistingDoc => !!doc);

  // The queue items used to be uploaded incorrectly which causes problems for
  // the applyChanges code.
  docs.forEach(d => {
    if (!d.id.startsWith('/')) {
      d.id = `/${d.id}`;
    }
  });

  const updates = await Promise.all(
    groupBy(docs, (d: models.ExistingDoc) => d.topic_id).map(
      async ([id, list]: [string, models.ExistingDoc[]]) =>
        buildQueueTopicUpdates(id, list)
    )
  ).then(list => list.flat());

  await applyChanges(updates, docs);
}

async function buildQueueTopicUpdates(
  topicId: string,
  list: models.ExistingDoc[]
): Promise<models.DocUpdate[]> {
  const db = await getDB();
  const topic = await db.get<models.ExistingDoc>(topicToDocID(topicId));
  const newDocs = [topic] as models.DocUpdate[];

  list.forEach(doc => pushQueueTopicUpdates(topic, topicId, doc, newDocs));

  return newDocs;
}

interface ArrayAcceptsStrings {
  indexOf(value: string): number;
  unshift(value: string): void;
}

function pushQueueTopicUpdates(
  topic: models.ExistingDoc,
  topicId: string,
  { id, text, created_at }: models.ExistingDoc,
  newDocs: models.DocUpdate[]
) {
  if (!text) {
    return;
  }

  if (!id) {
    id = `/${cuid()}`;
  }
  if (!id.startsWith('/')) {
    id = `/${id}`;
  }
  if (!created_at) {
    created_at = Date.now();
  }

  let listField: ArrayAcceptsStrings;
  let fieldName: string;
  if (text.startsWith('http')) {
    id = text;
    fieldName = 'links';
    listField = topic.links = topic.links || ([] as models.LinkList);
  } else {
    fieldName = 'queue';
    listField = topic.queue = topic.queue || ([] as string[]);
  }

  if (listField.indexOf(id) > -1) {
    return;
  }

  listField.unshift(id);

  // We can't use generatePatches here because then we'd
  // have to deep clone the topic before adding to it's array.
  // This is just easier for now
  if (!topic.patches) {
    topic.patches = [];
  }
  topic.patches.push({
    op: 'add',
    field: fieldName,
    value: id,
  });

  if (text.startsWith('http')) {
    return;
  }

  const newTopic = {
    _id: topicToDocID(id),
    id,
    context: topicId,
    text,
    created_at,
  } as models.DocUpdate;

  generatePatches({}, newTopic);
  newDocs.push(newTopic);
}
