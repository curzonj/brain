import levelup, { LevelUp } from 'levelup';
import {
  AbstractLevelDOWN,
  AbstractIterator,
  AbstractIteratorOptions,
  AbstractBatch,
  AbstractOptions,
  AbstractGetOptions,
} from 'abstract-leveldown';
import { Indexes, Indexers, Index } from './indexing';
import sublevel from './sublevel';
import { ComplexError, annotateErrors } from '../common/errors';

export function wrap<V>(db: AbstractLevelDOWN<string, V>) {
  return new LevelWrapper<V, {}>(db, {});
}

export class LevelWrapper<V, IDXRS extends Indexers<V>> {
  db: LevelUp<AbstractLevelDOWN<string, V>, AbstractIterator<string, V>>;
  base: LevelUp<AbstractLevelDOWN<string, any>, AbstractIterator<string, any>>;
  idx: Indexes<V, IDXRS>;
  private indexed: boolean;

  constructor(db: AbstractLevelDOWN<string, V>, indexers: IDXRS) {
    this.base = levelup(db);
    this.db = levelup(sublevel<V, string>(this.base, 'objects'));
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
        sublevel<VS, string>(this.base, name),
        indexers
      );
  }

  sub<VS = V>(name: string) {
    return new LevelWrapper<VS, {}>(sublevel<VS, string>(this.base, name), {});
  }

  async getAll(options: AbstractIteratorOptions = {}): Promise<V[]> {
    const list: V[] = [];

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
