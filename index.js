require('babel-polyfill')

const css = require('sheetify')
const choo = require('choo')

css('tachyons')

const app = choo()
//if (process.env.NODE_ENV !== 'production') {
  app.use(require('choo-devtools')())
//} else {
  //app.use(require('choo-service-worker')("/brain/sw.js"))
//}

app.use(require('./stores/pouchdb'))

const main = require('./views/main')

app.route('/brain', main)
app.route('/brain/:doc_id', main)

console.log(app)

module.exports = app.mount('body')
