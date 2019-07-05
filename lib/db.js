const PouchDB = require('pouchdb');
const md5 = require('blueimp-md5');
const cuid = require('cuid');
const { sublevel, nested, base } = require('../lib/leveldb');

module.exports = {
  hash,
  getTopic(topicKey) {
    return sublevel('topics').get(hash(topicKey));
  },
  getManyTopics(list) {
    const db = sublevel('topics');
    return Promise.all(list.map(async k => db.get(hash(k)).catch(err => {})));
  },
  async getNotes(topicId) {
    const notesLevelDB = nested(sublevel('notes'), topicId);
    const list = await getAll(notesLevelDB);

    return list.map(n => n.text);
  },
  async addNote({ topicId, text }) {
    if (topicId === '/index') {
      topicId = '/inbox';
    }

    const lastSeq = await getLastSeq();
    const notesLevelDB = nested(sublevel('notes'), topicId);
    const id = cuid();
    await notesLevelDB.put(id, {
      topic_id: topicId,
      seq: lastSeq,
      created_at: Date.now(),
      id,
      text,
    });
  },
  async establishConnection(config) {
    if (!navigator.onLine) {
      return;
    }

    const remoteDb = new PouchDB(config.url, config);
    const lastSeq = await getLastSeq();

    await exportAndDestroyLocalPouchDB(remoteDb);

    // Uploading notes MUST happen before updating lastSeq
    // The sequence number is used to track when notes were last uploaded
    await uploadNotes(remoteDb);

    if (!lastSeq) {
      const { rows, update_seq: resultSequence } = await remoteDb.allDocs({
        include_docs: true,
        startkey: `$/topics/`,
        endkey: `$/topics/\uFFF0`,
        update_seq: true,
      });
      const ops = rows.map(({ doc }) => ({
        type: 'put',
        key: `!topics!${lastSlashItem(doc._id)}`,
        value: stripDoc(doc),
      }));

      ops.push({ type: 'put', key: '!configs!lastSeq', value: resultSequence });

      await base().batch(ops);
    } else {
      const { last_seq: resultLastSeq, results } = await remoteDb.changes({
        include_docs: true,
        since: lastSeq,
      });

      if (resultLastSeq === lastSeq) {
        return;
      }

      const ops = results
        .map(change => {
          if (change.id.startsWith('$/queue/')) {
            if (change.deleted) {
              const [noteId, topicId] = reverseSlashes(change.id);
              return { type: 'del', key: `!notes!!/${topicId}!${noteId}` };
            }
          } else {
            if (change.deleted) {
              return {
                type: 'del',
                key: `!topics!${lastSlashItem(change.id)}`,
              };
            }
            return {
              type: 'put',
              key: `!topics!${lastSlashItem(change.id)}`,
              value: stripDoc(change.doc),
            };
          }

          return null;
        })
        .filter(n => !!n);

      ops.push({ type: 'put', key: '!configs!lastSeq', value: resultLastSeq });

      await base().batch(ops);
    }
  },
};

async function getLastSeq() {
  const configsLevelDB = sublevel('configs');
  return configsLevelDB.get('lastSeq').catch(err => {});
}

async function uploadNotes(remoteDb) {
  const lastSeq = await getLastSeq();
  const notesLevelDB = sublevel('notes');
  const list = await getAll(notesLevelDB);

  await Promise.all(
    list.map(async note => {
      if (note.seq === lastSeq) {
        note._id = `$/queue/${note.topic_id}/${note.id}`;
        await remoteDb.put(note)
      }
    })
  );
}

async function exportAndDestroyLocalPouchDB(remoteDb) {
  const pouchdb = new PouchDB('wiki', {
    auto_compaction: true,
  });
  const { doc_count: docCount } = await pouchdb.info();
  if (docCount > 0) {
    await pouchdb.replicate.to(remoteDb);
  }
  await pouchdb.destroy();
}

function hash(s) {
  return md5(s);
}

function lastSlashItem(docId) {
  return reverseSlashes(docId)[0];
}

function reverseSlashes(v) {
  return v.split('/').reverse();
}

function getAll(db, ...rest) {
  const list = [];
  return new Promise((resolve, reject) => {
    db.createValueStream(...rest)
      .on('data', data => list.push(data))
      .on('error', err => reject(err))
      .on('end', () => resolve(list));
  });
}

function stripDoc(doc) {
  delete doc._id;
  delete doc._rev;

  return doc;
}
