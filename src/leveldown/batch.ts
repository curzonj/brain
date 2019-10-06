import { Bytes } from 'leveldown';
import {
  AbstractLevelDOWN,
  ErrorCallback,
  AbstractOptions,
  AbstractBatch,
} from 'abstract-leveldown';
import { WrappedAbstract, WrappingHandler, LUP } from './wrap_abstract';

type ALD<K> = AbstractLevelDOWN<K, any>;

class Batching<V, K extends Bytes> implements WrappingHandler<V, K> {
  readonly type = 'batch';
  base: LUP<K>;
  operations: AbstractBatch<K, V>[];

  constructor(base: LUP<K>) {
    this.base = base;
    this.operations = [];
  }

  async write() {
    if (this.operations.length === 0) return;

    const ops = this.operations;
    this.operations = [];

    await this.base.batch(ops);
  }

  put(
    db: ALD<K>,
    key: K,
    value: V,
    options: AbstractOptions,
    cb: ErrorCallback
  ) {
    if (options && options.writeBatch === true) {
      db.put(key, value, options, cb);
    } else {
      this.operations.push({ type: 'put', key, value });
      if (cb) process.nextTick(cb);
    }
  }

  del(db: ALD<K>, key: K, options: AbstractOptions, cb: ErrorCallback) {
    if (options && options.writeBatch === true) {
      db.del(key, options, cb);
    } else {
      this.operations.push({ type: 'del', key });
      if (cb) process.nextTick(cb);
    }
  }

  batch(
    db: ALD<K>,
    ops: AbstractBatch<K, V>[],
    options: AbstractOptions,
    cb: ErrorCallback
  ) {
    if (options && options.writeBatch === true) {
      db.batch(ops, options, cb);
    } else {
      ops.forEach(o => this.operations.push(o));
      if (cb) process.nextTick(cb);
    }
  }
}

function compatibleConstructor<V, K extends Bytes = string>(db: LUP<K>) {
  const batcher = new Batching<V, K>(db);

  return {
    db: new WrappedAbstract<V, K>(db, batcher) as AbstractLevelDOWN<K, V>,
    write: () => batcher.write(),
  };
}

export default compatibleConstructor;
