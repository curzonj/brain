module.exports = store;

const reg = require('../lib/event_helper')('pouchdb');
const db = require('../lib/db');

const NestedFieldNames = ['queue', 'next', 'later', 'stories', 'list'];
const RefStringFields = [...NestedFieldNames, 'src', 'mentions', 'related'];

function store(state, e) {
  state.pages = {};

  e.on('DOMContentLoaded', async () => {
    reg('note', addNote, state, e);
    reg('config', setConfig, state, e);
    e.on('navigate', updatePages);

    if (validateOrRedirect(state, e)) {
      await db.establishConnection(JSON.parse(localStorage.couchdb_target));
      await updatePages();
    }

    async function updatePages() {
      if (state.loadedFor === state.params.wildcard) return;

      const loading = state.params.wildcard;
      state.pages = await buildPages(loading);
      state.loadedFor = loading;

      e.emit(state.events.RENDER);
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

      await db.establishConnection(JSON.parse(localStorage.couchdb_target));
      await updatePages();
    }

    async function addNote({ topicId, value }) {
      const text = value.trim();
      const page = state.pages[state.params.wildcard];

      if (page.id === topicId) {
        if (!page.queue) {
          page.queue = [];
        }
        page.queue.unshift(text);
      }

      await db.addNote({ topicId, text });
      e.emit(state.events.RENDER);
    }

    async function appendQueueToPage(doc) {
      const notes = await db.getNotes(doc.id);
      if (notes.length === 0) {
        return;
      }

      if (!doc.queue) {
        doc.queue = [];
      }

      notes.forEach(item => {
        doc.queue.unshift(item);
      });
    }

    async function buildPages(topicId) {
      const pages = {};
      const doc = await db.getTopic(topicId).catch(console.log);
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

      const topics = await db.getManyTopics(list);
      topics.forEach(d => {
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
