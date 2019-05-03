module.exports = store;

const PouchDB = require('pouchdb');
const reg = require('../lib/event_helper')('pouchdb');

function store(state, e) {
  state.pages = {};

  e.on('DOMContentLoaded', async () => {
    const db = new PouchDB('wiki');

    if (!populateAuth()) {
      return;
    }

    state.pages = await sync(db);
    e.emit(state.events.RENDER);
  });
}

async function sync(db) {
  const str = localStorage.couchdb_target;
  if (!str) {
    return;
  }

  const config = JSON.parse(str);
  const remoteDb = new PouchDB(config.url, { auth: config.auth });

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
    if (doc.what) {
      allDocs[doc.what] = doc;
    }
  });

  return allDocs;
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
