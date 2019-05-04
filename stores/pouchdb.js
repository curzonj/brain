module.exports = store;

const PouchDB = require('pouchdb');
const reg = require('../lib/event_helper')('pouchdb');

function store(state, e) {
  state.pages = {};
  state.loading = true;

  e.on('DOMContentLoaded', async () => {
    const db = new PouchDB('wiki');

    reg('note', addNote, state, e)
    reg('sync', async () => {
      state.pages = await sync()
      e.emit(state.events.RENDER);
    }, state, e)

    if (!populateAuth()) {
      return;
    }

    const config = JSON.parse(localStorage.couchdb_target);
    const remoteDb = new PouchDB(config.url, { auth: config.auth });

    state.pages = await sync();
    state.loading = false;

    e.emit(state.events.RENDER);

    async function addNote(value) {
      const doc = await db.get("inbox")
      doc.thoughts.unshift(value)
      state.pages.inbox = doc
      await db.put(doc)
    }

    async function sync() {
      await db
        .sync(remoteDb, {
          live: false,
          retry: false,
        })
        .on('denied', function(err) {
          console.log('denied', err);
        })
        .on('error', function(err) {
          console.log('error', err);
        });

      const { rows } = await db.allDocs({
        include_docs: true,
      });

      const allDocs = {};
      rows.forEach(({ doc }) => {
        allDocs[doc._id] = doc;
        const spaces = doc._id.replace(/-/g, ' ')
        if (spaces !== doc._id) {
          allDocs[spaces] = doc
        }
        if (doc.aka) {
          doc.aka.forEach(k => { allDocs[k] = doc })
        }

        if (doc.what) {
          allDocs[doc.what] = doc;
        }
      });

      return allDocs;
    }
  });
}

function populateAuth() {
  if (localStorage.couchdb_target) {
    return true;
  }
  const result = prompt('replication target');
  if (!result) {
    alert('Unable to authenticate');
    return;
  }

  try {
    JSON.parse(result);
    localStorage.couchdb_target = result;
    return true;
  } catch (err) {
    console.log(err);
    alert('Unable to authenticate');
    return false;
  }
}
