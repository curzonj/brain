import { getPouchDBClass, getDB } from './db';
import morgan from 'morgan';
import express from 'express';
import cors from 'cors';

const pouchDbHandler = require('express-pouchdb')(getPouchDBClass(), {
  configPath: 'config/pouch_db.json',
  mode: 'fullCouchDB', // specified for clarity. It's the default so not necessary.
  overrideMode: {
    exclude: [
      'routes/authentication',
      // disabling the above, gives error messages which require you to disable the
      // following parts too. Which makes sense since they depend on it.
      'routes/authorization',
      'routes/session',
    ],
  },
});

const app = express();

app.use(morgan('combined'));
app.use(cors(pouchDbHandler.couchConfig._config.cors));
app.use('/', pouchDbHandler);

getDB()
  .then(() => {
    app.listen(3001);
    console.log('Go to http://localhost:3001/_utils/');
  })
  .catch(err => {
    console.error(err);
  });
