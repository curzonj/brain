const PouchDB = require('pouchdb');
const md5 = require('blueimp-md5');
const cuid = require('cuid');
const { reportError } = require('./errors');
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
    const payload = {
      _id: `$/queue/${topicId}/${id}`,
      topic_id: topicId,
      seq: lastSeq,
      created_at: Date.now(),
      id,
      text,
    };

    await notesLevelDB.put(id, payload);

    // async but we won't wait for it
    attemptNoteUpload(payload).catch(e =>
      reportError(e, {
        file: 'db',
        fn: 'attemptNoteUpload',
        at: 'catch',
      })
    );
  },
  configure(value) {
    if (!value || value === '') {
      return false;
    }

    try {
      JSON.parse(value);
    } catch (err) {
      return false;
    }

    localStorage.couchdb_target = value;

    return true;
  },
  async isConfigured() {
    if (!navigator.onLine) {
      return true;
    }

    const config = getDbTarget();
    if (!config) {
      return false;
    }

    const remoteDb = getDb();

    try {
      // TODO once I have a better idea of what errors from
      // this can look like I'll delete the config and return
      // false sometimes
      await remoteDb.info();
    } catch (e) {
      reportError(e, {
        at: 'db.isConfigured',
      });
    }

    return true;
  },

  async uploadNotes() {
    const remoteDb = getDb();
    const notesLevelDB = sublevel('notes');
    const list = await getAll(notesLevelDB);

    await Promise.all(
      list.map(async note => {
        note._id = `$/queue/${note.topic_id}/${note.id}`;
        const existing = await remoteDb.get(note._id).catch(async e => {
          if (e.status !== 404) {
            reportError(e, {
              file: 'db',
              fn: 'uploadNotes',
              at: 'failure',
              noteId: note._id,
            });

            return e;
          }

          if (e.reason === 'deleted') {
            // the translation between these IDs and couchdb is a
            // little broken so it's easier to just delete them from levelDB
            // when they are deleted from couchdb
            const topicNotes = nested(sublevel('notes'), note.topic_id);
            await topicNotes.del(note.id);

            return e;
          }

          return false;
        });

        if (existing) {
          console.log({
            file: 'db',
            fn: 'uploadNotes',
            at: 'skip',
            note,
            existing,
          });
        } else {
          await remoteDb.put(note);
        }
      })
    );
  },
  async sync(config) {
    if (!navigator.onLine) {
      return;
    }

    const remoteDb = getDb();
    const lastSeq = await getLastSeq();

    await exportAndDestroyLocalPouchDB(remoteDb);

    if (!lastSeq) {
      importToLevelDB(remoteDb, lastSeq);
    } else {
      updateLevelDB(remoteDb, lastSeq);
    }
  },
};

async function importToLevelDB(remoteDb, lastSeq) {
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
}

async function updateLevelDB(remoteDb, lastSeq) {
  const { last_seq: resultLastSeq, results } = await remoteDb.changes({
    include_docs: true,
    since: lastSeq,
    limit: 100,
    batch_size: 100,
  });

  if (results.length === 0) {
    return;
  }

  const ops = results
    .map(change => {
      // TODO currently this means that notes from other devices
      // won't show up until they get synced on my laptop
      if (!change.id.startsWith('$/queue/')) {
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

  return updateLevelDB(remoteDb, resultLastSeq);
}

let remoteDbMemoized;
function getDb() {
  if (!remoteDbMemoized) {
    const config = getDbTarget();
    remoteDbMemoized = new PouchDB(config.url, config);
  }

  return remoteDbMemoized;
}

function getDbTarget() {
  if (localStorage.couchdb_target) {
    try {
      const config = JSON.parse(localStorage.couchdb_target);
      if (!config.url || !config.auth) {
        throw new Error('Invalid db target config');
      }

      return config;
    } catch (e) {
      reportError(e);
      delete localStorage.couchdb_target;
    }
  }

  return null;
}

async function getLastSeq() {
  const configsLevelDB = sublevel('configs');
  return configsLevelDB.get('lastSeq').catch(err => {});
}

async function attemptNoteUpload(note) {
  if (!navigator.onLine) {
    return;
  }

  const remoteDb = getDb();
  await remoteDb.put(note);
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
