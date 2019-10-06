import leveljs from 'level-js';
import encoding from 'encoding-down';
import levelup from 'levelup';
import md5 from 'blueimp-md5';
import { wrap, Indexer } from '../../leveldown';
import batching from '../../leveldown/batch';
import * as models from '../../common/models';
import { ComplexError } from '../../common/errors';

const leveljsStore = leveljs('wiki');

const batched = batching<any, string>(
  levelup(encoding<string, any>(leveljsStore, { valueEncoding: 'id' }))
);
const base = wrap(batched.db);
const codeStorageVersion = 5;

export const write = batched.write;

const hl: (f: Indexer<models.Doc>) => Indexer<models.Doc> = fn => doc =>
  [fn(doc)]
    .flat()
    .filter(k => typeof k === 'string' && k.startsWith('/'))
    .map(hash);
export const topics = base.subIndexed<models.Doc>('topics')({
  src: hl(d => (typeof d.src === 'string' ? d.src : undefined)),
  queue: hl(d => d.queue),
  related: hl(d => d.related),
  mentions: hl(d => d.mentions),
  next: hl(d => d.next),
  later: hl(d => d.later),
  list: hl(d => d.list),
});

export const configs = base.sub<any>('configs');

export const notes = base.sub<models.NewNote>('notes');

export async function isStorageSchemaCurrent(): Promise<boolean> {
  const value = await configs
    .get('storageVersion')
    .catch((err: Error) => undefined);
  return value && value >= codeStorageVersion;
}

export async function resetStorageSchema() {
  console.log('Resetting storage schema');
  await leveljsStore.store('readwrite').clear();
  await configs.put('storageVersion', codeStorageVersion);
  await write();
}

export function hash(s: string) {
  if (!s.startsWith('/')) {
    throw new ComplexError('invalid topicId', { topicId: s });
  }
  return md5(s);
}
