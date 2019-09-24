import PouchDB from 'pouchdb';
import sleep from 'sleep-promise';
import * as fs from 'fs';
import { timingAsync } from './timing';
import pouchdbAdapterMemory from 'pouchdb-adapter-memory';

PouchDB.plugin(pouchdbAdapterMemory);

const config = JSON.parse(
  fs.readFileSync(`${__dirname}/../../config/sync.json`, 'utf8')
);

export const remote = new PouchDB<any>(config.url, { auth: config.auth });
export const InMemPouchDB = PouchDB.defaults({ adapter: 'memory' });

type PouchDBConstructor = new <Content extends {} = {}>(
  name?: string,
  options?: PouchDB.Configuration.DatabaseConfiguration
) => PouchDB.Database<Content>;

export function getPouchDBClass(): PouchDBConstructor {
  if (process.env.NODE_ENV === 'test') {
    return InMemPouchDB;
  } else {
    return PouchDB.defaults({ prefix: `${__dirname}/../../databases/` });
  }
}

async function openOrWait(path: string): Promise<PouchDB.Database<any>> {
  try {
    const db = new PouchDB<any>(path);
    await db.info();

    return db;
  } catch (e) {
    if (e.stack.startsWith('OpenError')) {
      await sleep(500);
      return openOrWait(path);
    } else {
      throw e;
    }
  }
}

const databasePromise = Promise.resolve().then(async () => {
  const prodDB = await timingAsync('databasePromise.openOrWait', () =>
    openOrWait(`${__dirname}/../../databases/gityaml`)
  );

  if (process.env.NODE_ENV !== 'test') {
    return prodDB;
  }

  return timingAsync('databasePromise.bulkDocs', async () => {
    const db = new InMemPouchDB('dev');
    const { rows } = await prodDB.allDocs({ include_docs: true });

    await db.bulkDocs(
      rows.map(r => {
        const newDoc = { ...r.doc };
        delete newDoc._rev;
        return newDoc;
      })
    );

    await prodDB.close();

    return db;
  });
});

export async function getDB(): Promise<PouchDB.Database<any>> {
  return databasePromise;
}
