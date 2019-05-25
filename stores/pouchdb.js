module.exports = store;

const PouchDB = require('pouchdb');
const reg = require('../lib/event_helper')('pouchdb');

function store(state, e) {
  state.pages = {};
  state.loading = true;

  e.on('DOMContentLoaded', async () => {
    if (window.location.origin === "https://localhost:8080") {
      await (new PouchDB('wiki')).destroy()
    }

    const db = new PouchDB('wiki', {
      auto_compaction: true,
    });

    reg('note', addNote, state, e)
    reg('config', setConfig, state, e)

    if (validateOrRedirect(state, e)) {
      establishConnection()
    }

    function establishConnection() {
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
    }

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

    async function setConfig(value) {
      if (!value || value === '') {
        return
      }

      try {
        JSON.parse(value)
      } catch(err) { return }

      localStorage.couchdb_target = value
      establishConnection()
    }


    async function addNote({ topic_id, value }) {
      const nonce = `${Date.now()}-${randomString(8)}`
      const text = value.trim()
      const doc = {
        _id: `$/queue/${topic_id}/${nonce}`,
        topic_id: topic_id,
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
        if (!doc.id) {
          console.log(doc)
          return
        }
        pages[doc.id] = doc;
        pages[doc.id.replace(/-/g, ' ')] = doc

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

function validateOrRedirect(state, e) {
  try {
    if (localStorage.couchdb_target && JSON.parse(localStorage.couchdb_target)) return true
  } catch (err) {}

  state.rawConfig = localStorage.couchdb_target
  e.emit('replaceState', '/brain#login');
}
