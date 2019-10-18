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
const codeStorageVersion = 6;

export const write = batched.write;

const hl: (
  f: (d: models.Doc) => undefined | models.Ref | models.Ref[]
) => Indexer<models.Doc> = fn => doc =>
  [fn(doc)]
    .flat()
    .filter(k => k && k.ref)
    .map(k => k.ref)
    .map(hash);
export const topics = base.subIndexed<models.Doc>('topics')({
  src: hl(d => (models.isRef(d.src) ? d.src : undefined)),
  related: hl(d => d.related),
  narrower: hl(d => d.narrower),
  broader: hl(d => d.broader),
  collection: hl(d => d.collection),
  next: hl(d => d.next),
  later: hl(d => d.later),
  isA: hl(d => d.isA),
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
  if (s.startsWith('/')) {
    throw new ComplexError('invalid topicId', { topicId: s });
  }
  return md5(s);
}
