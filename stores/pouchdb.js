module.exports = store;

const PouchDB = require('pouchdb');
const reg = require('../lib/event_helper')('pouchdb');
const sha256 = require('js-sha256')

const NestedFieldNames = ['queue', 'next', 'later', 'stories', 'list']
const RefStringFields = [ ...NestedFieldNames, 'src', 'mentions', 'related' ]

function store(state, e) {
  state.pages = {};

  e.on('DOMContentLoaded', async () => {
    if (window.location.origin === "https://localhost:8080") {
      await (new PouchDB('wiki')).destroy()
    }

    const db = new PouchDB('wiki', {
      auto_compaction: true,
    });

    function getTopic(topicKey) {
      return db.get("$/topics/"+sha256(topicKey))
    }

    reg('note', addNote, state, e)
    reg('config', setConfig, state, e)

    if (validateOrRedirect(state, e)) {
      establishConnection()
    }

    e.on('navigate', updatePages)

    function establishConnection() {
      const config = JSON.parse(localStorage.couchdb_target);
      const remoteDb = new PouchDB(config.url, config);

      db.sync(remoteDb, {
        live: true, retry: true
      }).on('change', function (change) {
        //console.log("pouchdb:change", change)
      }).on('paused', function (info) {
        //console.log("pouchdb:paused", info)
        updatePages()
      }).on('active', function (info) {
        //console.log("pouchdb:active", info)
      }).on('error', function (err) {
        //console.log("pouchdb:error", err)
        blockUpdates(err)
      }).on('denied', function(err) {
        //console.log('pouchdb:denied', err);
        blockUpdates(err)
      })
    }

    function blockUpdates(err) {
      state.pouchdbBroken = JSON.stringify(err)
      e.emit(state.events.RENDER);
    }

    async function updatePages() {
      if (state.loadedFor === state.params.wildcard) return;

      const loading = state.params.wildcard
      state.pages = await buildPages(loading);
      state.loadedFor = loading;

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
      const topicKey = sha256(topic_id)
      const doc = {
        _id: `$/queue/${topicKey}/${nonce}`,
        topic_id: topic_id,
        text
      }

      const page = state.pages[state.params.wildcard]
      if (!page.queue) {
        page.queue = []
      }
      page.queue.unshift(text)

      db.put(doc)
      e.emit(state.events.RENDER);
    }

    async function appendQueueToPage(doc) {
      if (!doc.queue) {
        doc.queue = []
      }

      const { id: topic_id, queue } = doc
      const topicKey = sha256(topic_id)
      const items = await db.allDocs({
        include_docs: true,
        startkey: `$/queue/${topicKey}`,
        endkey: `$/queue/${topicKey}\ufff0`
      }).
        then(({rows}) => rows.map(({doc: n}) => n))

      items.forEach(item => {
        queue.unshift(item)
      });

      if (doc.queue.length === 0) {
        delete doc.queue
      }
    }

    async function buildPages(topicId) {
      const pages = {}
      const doc = await getTopic(topicId).catch(console.log)

      pages[doc.id] = doc
      if (doc) {
        await appendQueueToPage(doc)
        doc.contextPaths = doc.context.map((v, i) => "/"+([ ...doc.context ].slice(0, i+1).join("/")));
        const nestedPaths = gatherNestedPaths(doc)
        await loadMorePages(pages, [ ...nestedPaths, ...doc.contextPaths ])
        const nestedDocs = nestedPaths.map(p => pages[p]);
        await Promise.all(nestedDocs.map(appendQueueToPage));
        await loadMorePages(pages, nestedDocs.flatMap(gatherNestedPaths));
      }

      return pages;
    }

    function gatherNestedPaths(doc) {
      return RefStringFields.flatMap(field => doc[field]).filter(s => s && s.startsWith && s.startsWith("/"));
    }

    async function loadMorePages(pages, list) {
      if (!list) return;
      if (!list.every(s => typeof s === "string")) {
        console.log(list)
        throw("invalid list items")
      }

      const ids = list.map(s => "$/topics/"+sha256(s))

      const { rows } = await db.allDocs({
        include_docs: true,
        keys: ids,
      })

      rows.
        filter(n => n.doc).
        map(n => n.doc).
        forEach(d => { pages[d.id] = d });
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
