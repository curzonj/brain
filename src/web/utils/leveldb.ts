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
    .filter(k => k !== undefined)
    .map(hash);
export const topics = base.subIndexed<models.Doc>('topics')({
  src: hl((d: models.Doc) => (typeof d.src === 'string' ? d.src : undefined)),
  queue: hl((d: models.Doc) => d.queue),
  related: hl((d: models.Doc) => d.related),
  mentions: hl((d: models.Doc) => d.mentions),
  next: hl((d: models.Doc) => (d.next || []).filter(l => l.startsWith('/'))),
  later: hl((d: models.Doc) => (d.later || []).filter(l => l.startsWith('/'))),
  list: hl((d: models.Doc) => (d.list || []).filter(l => l.startsWith('/'))),
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
