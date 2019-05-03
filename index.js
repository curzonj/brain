require('babel-polyfill')

const css = require('sheetify')
const choo = require('choo')

css('tachyons')

const app = choo()
if (process.env.NODE_ENV !== 'production') {
  app.use(require('choo-devtools')())
} else {
  app.use(require('choo-service-worker')())
}

app.use(require('./stores/pouchdb'))

const main = require('./views/main')
app.route('/', main)
app.route('/:doc_id', main)

module.exports = app.mount('body')
