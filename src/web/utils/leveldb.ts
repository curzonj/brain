import levelup, { LevelUp } from 'levelup';
import leveljs from 'level-js';
import sublevel from 'subleveldown';
import { AbstractLevelDOWN, AbstractIterator } from 'abstract-leveldown';
import { RdfStore } from 'quadstore';
import * as N3 from 'n3';

const { DataFactory } = N3;

export type TypedLevelUp<V> = LevelUp<
  AbstractLevelDOWN<string, V>,
  AbstractIterator<string, V>
>;

export function nested<V = any>(
  db: TypedLevelUp<any>,
  name: string
): TypedLevelUp<V> {
  return sublevel(db, name, { valueEncoding: 'id' });
}

const dbList = {} as { [key: string]: TypedLevelUp<any> };
export function dbNamespace<V>(name: string): TypedLevelUp<V> {
  if (!dbList[name]) {
    dbList[name] = sublevel(base(), name, { valueEncoding: 'id' });
  }

  return dbList[name] as TypedLevelUp<V>;
}

export const rdfStore = new RdfStore(leveljs('rdf'), {
  dataFactory: DataFactory,
});

let basedb: TypedLevelUp<any>;
export function base(): TypedLevelUp<any> {
  if (!basedb) {
    basedb = levelup(leveljs('wiki'));
  }

  return basedb;
}
