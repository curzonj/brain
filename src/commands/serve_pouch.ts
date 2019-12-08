import { Command } from '@oclif/command';
import morgan from 'morgan';
import express from 'express';
import cors from 'cors';
import expressPouchDB from 'express-pouchdb';
import { getPouchDBClass, getDB } from '../cli/db';
import { expressPouchDBConfig } from '../cli/paths';
import debug from '../common/debug';

debug.trace('configuration path = %s', expressPouchDBConfig);

export default class ServerPouchCommand extends Command {
  public async run() {
    const pouchDbHandler = expressPouchDB(getPouchDBClass(), {
      configPath: expressPouchDBConfig,
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

    await getDB();

    app.listen(3001);
    console.log('Go to http://localhost:3001/_utils/');
  }
}
