import {
  AbstractIteratorOptions,
  AbstractBatch,
  AbstractOptions,
  PutBatch,
  DelBatch,
} from 'abstract-leveldown';

export type Indexer<V> = (o: V) => undefined | string | string[];
export interface Indexers<V> {
  [key: string]: Indexer<V>;
}
export type Indexes<V, IDXRS> = { [key in keyof IDXRS]: Index<V> };

export const ENDstr = '\xff';
interface IndexBase<V> {
  get(k: string): Promise<V>;
}
interface IndexHolder {
  forEach(
    options: AbstractIteratorOptions,
    fn: (k: string, v: string) => void | Promise<void>
  ): Promise<void>;
  batch(
    array: AbstractBatch<string, string>[],
    options?: AbstractOptions
  ): Promise<void>;
}
export class Index<V> {
  indexer: Indexer<V>;
  indexDb: IndexHolder;
  base: IndexBase<V>;

  constructor(base: IndexBase<V>, secondary: IndexHolder, indexer: Indexer<V>) {
    this.base = base;
    this.indexDb = secondary;
    this.indexer = indexer;
  }

  async get(k: string): Promise<V[]> {
    return this.getAll({ gte: `${k}!`, lt: `${k}!${ENDstr}` });
  }

  async getAllKeys(options: AbstractIteratorOptions): Promise<string[]> {
    const list: string[] = [];

    await this.indexDb.forEach(options, (k, v) => {
      list.push(k.split('!')[0]);
    });

    return list;
  }

  async getAll(options: AbstractIteratorOptions): Promise<V[]> {
    const list: V[] = [];

    await this.forEach(options, (k, v) => {
      list.push(v);
    });

    return list;
  }

  async forEach(
    options: AbstractIteratorOptions,
    fn: (k: string, v: V) => void | Promise<void>
  ) {
    await this.indexDb.forEach(options, async (indexedKey, originalKey) => {
      const value = await this.base.get(originalKey);
      await fn(originalKey, value);
    });
  }

  async updateIndex(
    batches: AbstractBatch<string, V>[],
    options: AbstractOptions | undefined,
    possiblePuts: boolean
  ) {
    const indexOps: AbstractBatch<string, string>[] = possiblePuts
      ? await this.indexDelsBatchList(batches)
      : this.indexPutsBatchList(batches);

    if (indexOps.length > 0) await this.indexDb.batch(indexOps, options);
  }

  private async indexDelsBatchList(
    batches: AbstractBatch<string, V>[]
  ): Promise<AbstractBatch<string, string>[]> {
    return (await Promise.all(
      batches.map(async b =>
        indexBatch(
          b,
          this.indexer,
          b.type === 'put'
            ? b.value
            : await this.base.get(b.key).catch(e => undefined)
        )
      )
    )).flat();
  }

  private indexPutsBatchList(
    batches: AbstractBatch<string, V>[]
  ): AbstractBatch<string, string>[] {
    return batches
      .map(b => indexBatch(b, this.indexer, (b as PutBatch).value))
      .flat();
  }
}

function indexBatch<V>(
  b: AbstractBatch<string, V>,
  indexer: Indexer<V>,
  value: V | undefined
): AbstractBatch<string, string>[] {
  if (value === undefined) {
    return [];
  }

  const indexKeys = [indexer(value)].flat().filter(k => k !== undefined);
  return indexKeys.map(
    (key: string): AbstractBatch<string, string> => {
      const indexKey = [key, b.key].join('!');
      return b.type === 'put'
        ? ({
            type: 'put',
            key: indexKey,
            value: b.key,
          } as PutBatch)
        : ({
            type: 'del',
            key: indexKey,
          } as DelBatch);
    }
  );
}
