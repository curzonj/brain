import { Command } from '@oclif/command';
import cuid from 'cuid';

import { applyChanges, dumpJSON, topicToDocID } from '../cli/content';
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
  if (!text || text.startsWith('/')) {
    return;
  }

  if (text.startsWith('http')) {
    const links = (topic.links = topic.links || ([] as models.Link[]));
    if (links.indexOf(text) > -1) {
      return;
    }

    links.unshift(text);
  } else {
    console.error(`WARNING: ${id} on ${topicId} was not inserted directly`);
    if (!id) {
      id = cuid();
    } else if (id.startsWith('/')) {
      id = id.slice(1);
    }
    if (!created_at) {
      created_at = Date.now();
    }

    const newTopic = {
      _id: topicToDocID(id),
      id,
      broader: [{ ref: topicId }],
      text,
      created_at,
    } as models.DocUpdate;

    newDocs.push(newTopic);
  }
}
