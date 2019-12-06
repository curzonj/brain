import leveljs from 'level-js';
import encoding from 'encoding-down';
import levelup from 'levelup';
import leveldown from 'leveldown';
import memdown from 'memdown';
import xdgBasedir from 'xdg-basedir';
import * as fs from 'fs';
import { WordTokenizer } from 'natural';

import { wrap } from '../leveldown';
import batching from '../leveldown/batch';
import * as models from './models';

const codeStorageVersion = 9;

const tokenizer = new WordTokenizer();
const leveljsStore = switchEnvironment(env => {
  switch(env) {
    case 'test':
      return memdown();
    case 'nodejs':
      return leveldown(buildAndPreparePath());
    case 'browser':
      return leveljs('wiki');
    default:
      throw "invalid env string";
  };
});

const batched = batching<any, string>(
  levelup(encoding<string, any>(leveljsStore, { valueEncoding: 'json' }))
);
const base = wrap(batched.db);

export const write = batched.write;

export const topics = base.subIndexed<models.Payload>('topics')({
  backrefs: p => {
    const refs = models.getAllRefs(p.topic).map(r => r.ref);
    return refs;
  },
  terms: ({ topic: p }) => {
    return [p.text || [], p.title || []]
      .flat()
      .flatMap(s => tokenizer.tokenize(s.toLowerCase()))
      .filter(s => s.length > 3 && s.match(/^[a-z]+$/))
  },
});

export const uploads = base.sub<models.Create<models.Payload>>('uploads');
export const configs = base.sub<any>('configs');

export async function isStorageSchemaCurrent(): Promise<boolean> {
  return switchEnvironment(async env => {
    switch(env) {
      case 'browser':
        const value = await configs
          .get('storageVersion')
          .catch((err: Error) => undefined);
        return value && value >= codeStorageVersion;
      default:
        return true;
    }
  });
}

export async function resetStorageSchema() {
  console.log('Resetting storage schema');
  switchEnvironment(async env => {
    switch(env) {
      case 'browser':
        await leveljsStore.store('readwrite').clear();
        await configs.put('storageVersion', codeStorageVersion);
        await write();
        break;
    }
  });
}

function buildAndPreparePath() {
  const dir = `${xdgBasedir.data}/kbase/leveldb/${codeStorageVersion}`;
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
  }

  return dir;
}

export type PossibleEnvironments = 'nodejs' | 'test' | 'browser';
export function switchEnvironment<T>(fn: (s: PossibleEnvironments) => T): T {
  if (process.env.NODE_ENV === 'test') return fn('test');
  if (typeof indexedDB !== 'undefined') return fn('browser');
  return fn('nodejs');
}
