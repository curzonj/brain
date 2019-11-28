import leveljs from 'level-js';
import encoding from 'encoding-down';
import  memdown from 'memdown';
import levelup from 'levelup';
import { wrap } from '../../leveldown';
import batching from '../../leveldown/batch';
import * as models from '../../common/models';

const leveljsStore = typeof indexedDB === 'undefined' ? memdown() : leveljs('wiki');

const batched = batching<any, string>(
  levelup(encoding<string, any>(leveljsStore, { valueEncoding: 'id' }))
);
const base = wrap(batched.db);
const codeStorageVersion = 8;

export const write = batched.write;

export const topics = base.subIndexed<models.Payload>('topics')({
  backrefs: p => models.getAllRefs(p.topic).map(r => r.ref),
});

export const uploads = base.sub<models.Create<models.Payload>>('uploads');
export const configs = base.sub<any>('configs');

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
