import levelup, { LevelUp } from 'levelup';
import {
  AbstractLevelDOWN,
  AbstractIterator,
  AbstractIteratorOptions,
  AbstractBatch,
  AbstractOptions,
  AbstractGetOptions,
  PutBatch,
  DelBatch,
} from 'abstract-leveldown';
import sublevel from './sublevel';
import { ComplexError, annotateErrors } from '../common/errors';

export type Indexer<V> = (o: V) => undefined | string | string[];
interface Indexers<V> {
  [key: string]: Indexer<V>;
}
type Indexes<V, IDXRS> = { [key in keyof IDXRS]: Index<V> };

export function wrap<V>(db: AbstractLevelDOWN<string, V>) {
  return new LevelWrapper<V, {}>(db, {});
}

class LevelWrapper<V, IDXRS extends Indexers<V>> {
  db: LevelUp<AbstractLevelDOWN<string, V>, AbstractIterator<string, V>>;
  idx: Indexes<V, IDXRS>;
  private indexed: boolean;

  constructor(db: AbstractLevelDOWN<string, V>, indexers: IDXRS) {
    this.db = levelup(db);
    this.idx = this.buildIndexes(indexers);
    this.indexed = Object.keys(this.idx).length > 0;
  }

  private buildIndexes(indexers?: IDXRS): Indexes<V, IDXRS> {
    if (!indexers) return {} as Indexes<V, IDXRS>;

    const idx = {} as Indexes<V, IDXRS>;
    for (const k in indexers) {
      idx[k] = new Index(this, this.sub<string>(`idx-${k}`), indexers[k]);
    }

    return idx;
  }

  private async updateIndexes(
    batches: AbstractBatch<string, V>[],
    options: AbstractOptions | undefined,
    delsPossible: boolean = true
  ) {
    try {
      await Promise.all(
        Object.values(this.idx).map(async indexes =>
          indexes.updateIndex(batches, options, delsPossible)
        )
      );
    } catch (e) {
      throw new ComplexError('failed to update indexes for batch', {
        cause: e,
        batches,
      });
    }
  }

  async get(key: string, options?: AbstractGetOptions): Promise<V> {
    return annotateErrors({ key }, () => this.db.get(key, options));
  }

  async put(key: string, value: V, options?: AbstractOptions) {
    if (this.indexed && (!options || options.freshIndexes !== true)) {
      await this.updateIndexes([{ type: 'del', key }], options);
    }

    await this.db.put(key, value, options);
    if (this.indexed)
      await this.updateIndexes([{ type: 'put', key, value }], options, false);
  }

  async del(key: string, options?: AbstractOptions) {
    if (this.indexed) await this.updateIndexes([{ type: 'del', key }], options);
    await this.db.del(key, options);
  }

  async batch(array: AbstractBatch<string, V>[], options?: AbstractOptions) {
    await this.db.batch(array, options);
    if (this.indexed) await this.updateIndexes(array, options);
  }

  // We need to return a sub function in order to have both a required
  // type parameter and an inferred type parameter
  subIndexed<VS>(name: string) {
    return <SUBIDXRS extends Indexers<VS>>(indexers: SUBIDXRS) =>
      new LevelWrapper<VS, SUBIDXRS>(
        sublevel<VS, string>(this.db, name),
        indexers
      );
  }

  sub<VS = V>(name: string) {
    return new LevelWrapper<VS, {}>(sublevel<VS, string>(this.db, name), {});
  }

  async getAll(options: AbstractIteratorOptions): Promise<V[]> {
    const list = [] as V[];

    await this.forEach(options, (k, v) => {
      list.push(v);
    });

    return list;
  }

  async forEach(
    options: AbstractIteratorOptions,
    fn: (k: string, v: V) => void | Promise<void>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const iter = this.db.iterator(options);

      function next() {
        iter.next((err, key, value) => {
          if (err) {
            iter.end(err2 => {
              reject(new ComplexError(err));
            });
          } else {
            if (key && value) {
              Promise.resolve()
                .then(async () => fn(key, value))
                .then(next, reject);
            } else {
              iter.end(err2 => {
                if (err2) {
                  reject(new ComplexError(err2));
                } else {
                  resolve();
                }
              });
            }
          }
        });
      }

      next();
    });
  }
}

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
class Index<V> {
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

  async getAll(options: AbstractIteratorOptions): Promise<V[]> {
    const list = [] as V[];

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
