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
  operations: AbstractBatch<K, V>[];

  constructor() {
    this.operations = [];
  }

  takeOperations() {
    const ops = this.operations;
    this.operations = [];

    return ops;
  }

  put(
    db: ALD<K>,
    key: K,
    value: V,
    options: AbstractOptions,
    cb: ErrorCallback
  ) {
    this.operations.push({ type: 'put', key, value });
    if (cb) process.nextTick(cb);
  }

  del(db: ALD<K>, key: K, options: AbstractOptions, cb: ErrorCallback) {
    this.operations.push({ type: 'del', key });
    if (cb) process.nextTick(cb);
  }

  batch(
    db: ALD<K>,
    ops: AbstractBatch<K, V>[],
    options: AbstractOptions,
    cb: ErrorCallback
  ) {
    ops.forEach(o => this.operations.push(o));
    if (cb) process.nextTick(cb);
  }
}

function compatibleConstructor<V, K extends Bytes = string>(db: LUP<K>) {
  const batcher = new Batching<V, K>();

  return {
    db: new WrappedAbstract<V, K>(db, batcher) as AbstractLevelDOWN<K, V>,
    async write() {
      return db.batch(batcher.takeOperations());
    },
  };
}

export default compatibleConstructor;
