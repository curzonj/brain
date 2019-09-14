const { reportError } = require('../lib/errors');
const reg = require('../lib/event_helper')('pages');
const db = require('../lib/db');
const { buildAbstractPage } = require('../lib/abstract_page');

module.exports = store;

function store(state, e) {
  state.pages = {};

  e.on('DOMContentLoaded', async () => {
    reg('note', addNote, state, e);
    reg('config', setConfig, state, e);
    e.on('navigate', updatePages);

    syncDatabase().catch(console.log);
  });

  async function syncDatabase() {
    const dbTestResult = await db.isConfigured();

    if (dbTestResult) {
      await db.sync().catch(error =>
        reportError(error, {
          at: 'db.sync',
        })
      );
      await updatePages();

      // async but we won't wait for it
      db.uploadNotes().catch(error =>
        reportError(error, {
          file: 'db',
          fn: 'uploadNotes',
          at: 'catch',
        })
      );
    } else {
      e.emit('replaceState', '/brain#login');
    }
  }

  async function updatePages() {
    if (state.loadedFor === state.params.wildcard) return;

    const loading = state.params.wildcard;
    state.abstractPage = await buildAbstractPage(loading);
    state.loadedFor = loading;

    e.emit(state.events.RENDER);
  }

  async function setConfig(value) {
    if (db.configure(value)) {
      await db.sync();
      await updatePages();
    }
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
}
