require('babel-polyfill');

const html = require('choo/html');
const css = require('sheetify');
const choo = require('choo');
const chooDevtools = require('choo-devtools');
const chooServiceWorker = require('choo-service-worker');

css('tachyons');

const app = choo();
if (process.env.NODE_ENV !== 'production') {
  app.use(chooDevtools());
  app.use(chooServiceWorker('/sw.js'));
} else {
  app.use(
    chooServiceWorker('/brain/sw.js', {
      scope: '/brain/',
    })
  );
}

app.use((state, emitter) => {
  emitter.on('DOMContentLoaded', () => {
    emitter.on(state.events.NAVIGATE, () => {
      window.scrollTo(0, 0);
    });
  });
});

app.use((state, emitter) => {
  emitter.on('DOMContentLoaded', () => {
    emitter.emit(state.events.DOMTITLECHANGE, 'brain');
  });
});

app.use(require('./stores/pouchdb'));

app.route('/', redirectIndex);
app.route('/brain', redirectIndex);
app.route('/brain/login', require('./views/login'));
app.route('/brain/add_note/*', require('./views/add_note'));
app.route('/brain/*', require('./views/main'));

module.exports = app.mount('body');

function redirectIndex(state, emit) {
  emit('replaceState', '/brain#/index');
  return html`
    <body>
      Redirecting ...
    </body>
  `;
}
