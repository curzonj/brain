module.exports = store;

const PouchDB = require('pouchdb');
const reg = require('../lib/event_helper')('pouchdb');

function store(state, e) {
  state.pages = {};
  state.loading = true;

  e.on('DOMContentLoaded', async () => {
    const db = new PouchDB('wiki');

    reg('note', addNote, state, e)

    if (!populateAuth()) {
      return;
    }

    const config = JSON.parse(localStorage.couchdb_target);
    const remoteDb = new PouchDB(config.url, config);

    db.sync(remoteDb, {
      live: true, retry: true
    }).on('change', function (change) {
      console.log("pouchdb:change", change)
    }).on('paused', function (info) {
      console.log("pouchdb:paused", info)
      updatePages()
    }).on('active', function (info) {
      console.log("pouchdb:active", info)
    }).on('error', function (err) {
      console.log("pouchdb:error", err)
      blockUpdates(err)
    }).on('denied', function(err) {
      console.log('pouchdb:denied', err);
      blockUpdates(err)
    })

    function blockUpdates(err) {
      state.pouchdbBroken = JSON.stringify(err)
      e.emit(state.events.RENDER);
    }

    async function updatePages() {
      state.pages = await buildPages();
      await appendQueueToPages(state.pages);
      state.loading = false;

      e.emit(state.events.RENDER);
    }

    function randomString(length) {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for(var i = 0; i < length; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    async function addNote({ doc_id, value }) {
      const nonce = `${Date.now()}-${randomString(8)}`
      const text = value.trim()
      const doc = {
        _id: `$/queue/${doc_id}/${nonce}`,
        topic_id: doc_id,
        text
      }

      db.put(doc)
      addItemToPageQueue(state.pages, doc)
      e.emit(state.events.RENDER);
    }

    function addItemToPageQueue(pages, { topic_id, text }) {
      let page = pages[topic_id]
      if (!page) {
        page = pages[topic_id] = {}
      }
      if (!page.queue) {
        page.queue = []
      }
      page.queue.unshift(text)
    }

    async function appendQueueToPages(pages) {
      const docs = await db.allDocs({
        include_docs: true,
        startkey: '$/queue/',
        endkey: '$/queue/\ufff0'
      }).
        then(({rows}) => rows.map(({doc}) => doc))

      docs.forEach(doc => {
        addItemToPageQueue(pages, doc)
      });
    }

    async function buildPages() {
      const docs = await db.allDocs({
        include_docs: true,
        startkey: '$/topics/',
        endkey: '$/topics/\ufff0'
      }).
        then(({rows}) => rows.map(({doc}) => doc))

      const pages = {};
      docs.forEach(doc => {
        const key = doc._id.split("/")[2]
        pages[key] = doc;
        pages[key.replace(/-/g, ' ')] = doc

        if (doc.aka) {
          doc.aka.forEach(k => {
            pages[k] = doc
            pages[k.replace(/-/g, ' ')] = doc
          })
        }

        if (doc.what) {
          pages[doc.what] = doc;
        }
      });

      return pages;
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
