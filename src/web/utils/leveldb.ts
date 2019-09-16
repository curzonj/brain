import levelup, { LevelUp } from 'levelup';
import leveljs from 'level-js';
import sublevel from 'subleveldown';
import { RdfStore } from 'quadstore';
import * as N3 from 'n3';

const { DataFactory } = N3;

export function nested(db: LevelUp, name: string): LevelUp {
  return sublevel(db, name, { valueEncoding: 'id' });
}

const dbList = {} as { [key: string]: LevelUp };
export function dbNamespace(name: string): LevelUp {
  if (!dbList[name]) {
    dbList[name] = sublevel(base(), name, { valueEncoding: 'id' });
  }

  return dbList[name];
}

export const rdfStore = new RdfStore(leveljs('rdf'), {
  dataFactory: DataFactory,
});

let basedb: LevelUp;
export function base(): LevelUp {
  if (!basedb) {
    basedb = levelup(leveljs('wiki'));
  }

  return basedb;
}
