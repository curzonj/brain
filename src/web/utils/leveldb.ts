import leveljs from 'level-js';
import encoding from 'encoding-down';
import levelup from 'levelup';
import md5 from 'blueimp-md5';
import { wrap } from '../../leveldown';
import batching from '../../leveldown/batch';
import * as models from '../../common/models';
import { ComplexError } from '../../common/errors';

const leveljsStore = leveljs('wiki');

const batched = batching<any, string>(
  levelup(encoding<string, any>(leveljsStore, { valueEncoding: 'id' }))
);
const base = wrap(batched.db);
const codeStorageVersion = 3;

export const write = batched.write;

export const topics = base.subIndexed<models.Doc>('topics')({
  queue: (d: models.Doc) => (d.queue || []).map(hash),
  list: (d: models.Doc) =>
    (d.list || []).filter(l => l.startsWith('/')).map(hash),
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
