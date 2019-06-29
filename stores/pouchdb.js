module.exports = store;

const PouchDB = require('pouchdb');
const md5 = require('blueimp-md5');
const reg = require('../lib/event_helper')('pouchdb');

const NestedFieldNames = ['queue', 'next', 'later', 'stories', 'list'];
const RefStringFields = [...NestedFieldNames, 'src', 'mentions', 'related'];

function hash(s) {
  return md5(s);
}

function store(state, e) {
  state.pages = {};

  e.on('DOMContentLoaded', async () => {
    if (window.location.origin === 'https://localhost:8080') {
      await new PouchDB('wiki').destroy();
    }

    const db = new PouchDB('wiki', {
      auto_compaction: true,
    });

    function getTopic(topicKey) {
      return db.get(`$/topics/${hash(topicKey)}`);
    }

    reg('note', addNote, state, e);
    reg('config', setConfig, state, e);

    if (validateOrRedirect(state, e)) {
      establishConnection();
    }

    e.on('navigate', updatePages);

    function establishConnection() {
      const config = JSON.parse(localStorage.couchdb_target);
      const remoteDb = new PouchDB(config.url, config);

      db.sync(remoteDb, {
        live: true,
        retry: true,
      })
        .on('change', change => {
          // console.log("pouchdb:change", change)
        })
        .on('paused', info => {
          // console.log("pouchdb:paused", info)
          updatePages();
        })
        .on('active', info => {
          // console.log("pouchdb:active", info)
        })
        .on('error', err => {
          // console.log("pouchdb:error", err)
          blockUpdates(err);
        })
        .on('denied', err => {
          // console.log('pouchdb:denied', err);
          blockUpdates(err);
        });
    }

    function blockUpdates(err) {
      state.pouchdbBroken = JSON.stringify(err);
      e.emit(state.events.RENDER);
    }

    async function updatePages() {
      if (state.loadedFor === state.params.wildcard) return;

      const loading = state.params.wildcard;
      state.pages = await buildPages(loading);
      state.loadedFor = loading;

      e.emit(state.events.RENDER);
    }

    function randomString(length) {
      let text = '';
      const possible =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      for (let i = 0; i < length; i += 1) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
      }
      return text;
    }

    async function setConfig(value) {
      if (!value || value === '') {
        return;
      }

      try {
        JSON.parse(value);
      } catch (err) {
        return;
      }

      localStorage.couchdb_target = value;
      establishConnection();
    }

    async function addNote({ topicId, value }) {
      const nonce = `${Date.now()}-${randomString(8)}`;
      const text = value.trim();
      if (topicId === '/index') {
        topicId = '/inbox';
      }
      const topicKey = hash(topicId);
      const doc = {
        _id: `$/queue/${topicKey}/${nonce}`,
        topic_id: topicId,
        text,
      };

      const page = state.pages[state.params.wildcard];
      if (page.id === topicId) {
        if (!page.queue) {
          page.queue = [];
        }
        page.queue.unshift(text);
      }

      db.put(doc);
      e.emit(state.events.RENDER);
    }

    async function appendQueueToPage(doc) {
      if (!doc.queue) {
        doc.queue = [];
      }

      const topicKey = hash(doc.id);
      const items = await db
        .allDocs({
          include_docs: true,
          startkey: `$/queue/${topicKey}`,
          endkey: `$/queue/${topicKey}\uFFF0`,
        })
        .then(({ rows }) => rows.map(({ doc: n }) => n));

      items.forEach(item => {
        doc.queue.unshift(item);
      });

      if (doc.queue && doc.queue.length === 0) {
        delete doc.queue;
      }
    }

    async function buildPages(topicId) {
      const pages = {};
      const doc = await getTopic(topicId).catch(console.log);
      if (!doc) return pages;

      pages[doc.id] = doc;
      await appendQueueToPage(doc);
      doc.context = doc.context ? doc.context.split('/').slice(1) : [];
      doc.contextPaths = doc.context.map(
        (v, i) => `/${[...doc.context].slice(0, i + 1).join('/')}`
      );
      const nestedPaths = gatherNestedPaths(doc);
      await loadMorePages(pages, [...nestedPaths, ...doc.contextPaths]);
      nestedPaths.forEach(p => {
        if (!pages[p]) {
          console.log(`missing page for ${p}`);
        }
      });
      const nestedDocs = nestedPaths.map(p => pages[p]);
      await Promise.all(nestedDocs.map(appendQueueToPage));
      await loadMorePages(pages, nestedDocs.flatMap(gatherNestedPaths));

      return pages;
    }

    function gatherNestedPaths(doc) {
      return RefStringFields.flatMap(field => {
        if (typeof doc[field] === 'string' && doc[field].startsWith('/')) {
          return doc[field];
        }
        if (Array.isArray(doc[field])) {
          return doc[field].flatMap(s => {
            if (typeof s === 'string') {
              if (s.startsWith('/')) {
                return s;
              }
            } else {
              return gatherNestedPaths(s);
            }
            return undefined;
          });
        }
        return null;
      }).filter(s => !!s);
    }

    async function loadMorePages(pages, list) {
      if (!list) return;
      if (!list.every(s => typeof s === 'string')) {
        throw new Error('invalid list items');
      }

      const ids = list.map(s => `$/topics/${hash(s)}`);

      const { rows } = await db.allDocs({
        include_docs: true,
        keys: ids,
      });

      rows
        .filter(n => n.doc)
        .map(n => n.doc)
        .forEach(d => {
          pages[d.id] = d;
        });
    }
  });
}

function validateOrRedirect(state, e) {
  try {
    if (localStorage.couchdb_target && JSON.parse(localStorage.couchdb_target))
      return true;
  } catch (err) {
    console.error(err);
  }

  state.rawConfig = localStorage.couchdb_target;
  e.emit('replaceState', '/brain#login');
  return false;
}
