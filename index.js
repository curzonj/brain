require('babel-polyfill')

const html = require('choo/html');
const css = require('sheetify')
const choo = require('choo')

css('tachyons')

const app = choo()
if (process.env.NODE_ENV !== 'production') {
  app.use(require('choo-devtools')())
} else {
  //app.use(require('choo-service-worker')("/brain/sw.js"))
}

app.use((state, emitter) => {
  emitter.on('DOMContentLoaded', () => {
    emitter.on(state.events.NAVIGATE, () => {
      window.scrollTo(0, 0)
    })
  })
})

app.use((state, emitter) => {
  emitter.on('DOMContentLoaded', () => {
    emitter.emit(state.events.DOMTITLECHANGE, "brain");
  })
})

app.use(require('./stores/pouchdb'))

// Only useful in development because it won't match in prod
app.route('/', (state,emit) => {
  emit('replaceState', '/brain#index');
  return html`<body>Redirecting ...</body>`;
})

app.route('/brain', (state,emit) => {
  emit('replaceState', '#index');
  return html`<body>Redirecting ...</body>`;
})

app.route('/brain/:doc_id/add_note', require('./views/add_note'))
app.route('/brain/:doc_id', require('./views/main'))

module.exports = app.mount('body')
