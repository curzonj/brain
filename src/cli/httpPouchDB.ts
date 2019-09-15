import PouchDB from 'pouchdb';
import { getPouchDBClass, getDB } from './db';

if (process.env.NODE_ENV !== 'test') {
  console.log("Requires NODE_NEV=test");
  process.exit(1);
}

const pouchDbHandler = require('express-pouchdb')(getPouchDBClass(), {
  configPath: "config/pouch_db.json",
  mode: 'fullCouchDB', // specified for clarity. It's the default so not necessary.
  overrideMode: {
    exclude: [
      'routes/authentication',
      // disabling the above, gives error messages which require you to disable the
      // following parts too. Which makes sense since they depend on it.
      'routes/authorization',
      'routes/session'
    ]
  }
});

const morgan = require("morgan")
const express = require('express');
const app = express();

const corsOptions = {
  ...pouchDbHandler.couchConfig._config.cors,
  origin: "https://localhost:8080",
};

app.use(morgan('combined'))
app.use(require('cors')(corsOptions));
app.use('/', pouchDbHandler)

getDB().then(() => {
  app.listen(3000);
  console.log("listening on 3000")
}).catch(err => {
  console.error(err)
});
