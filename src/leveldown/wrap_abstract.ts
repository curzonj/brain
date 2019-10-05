import { LevelUp } from 'levelup';
import { Bytes } from 'leveldown';
import {
  AbstractLevelDOWN,
  AbstractOpenOptions,
  ErrorCallback,
  AbstractIterator,
  AbstractIteratorOptions,
  AbstractGetOptions,
  ErrorValueCallback,
  AbstractOptions,
  AbstractBatch,
} from 'abstract-leveldown';
import { ComplexError } from '../common/errors';

interface ImplementsAbstractLevelDOWN<K extends Bytes, V> {
  _open?(options: AbstractOpenOptions, cb: ErrorCallback): void;
  _close?(cb: ErrorCallback): void;
  _get?(key: K, options: AbstractGetOptions, cb: ErrorValueCallback<V>): void;
  _put?(key: K, value: V, options: AbstractOptions, cb: ErrorCallback): void;
  _del?(key: K, options: AbstractOptions, cb: ErrorCallback): void;
  _batch?(
    array: AbstractBatch<K, V>[],
    options: AbstractOptions,
    cb: ErrorCallback
  ): void;
  _iterator?(options: AbstractIteratorOptions<K>): AbstractIterator<K, V>;
}

export type ALD<K> = AbstractLevelDOWN<K, any>;
export type LUP<K> = LevelUp<ALD<K>, AbstractIterator<K, any>>;

export interface WrappingHandler<V, K extends Bytes> {
  type: string;

  down?(db: ALD<K>): ALD<K> | undefined;
  get?(
    db: ALD<K>,
    key: K,
    options: AbstractGetOptions,
    cb: ErrorValueCallback<V>
  ): void;
  put(
    db: ALD<K>,
    key: K,
    value: V,
    options: AbstractOptions,
    cb: ErrorCallback
  ): void;
  del(db: ALD<K>, key: K, options: AbstractOptions, cb: ErrorCallback): void;
  batch(
    db: ALD<K>,
    array: AbstractBatch<K, V>[],
    options: AbstractOptions,
    cb: ErrorCallback
  ): void;
  iterator?(
    src: ALD<K>,
    nested: ALD<K>,
    options: AbstractIteratorOptions<K>
  ): AbstractIterator<K, V>;
}

export class WrappedAbstract<V, K extends Bytes> extends AbstractLevelDOWN<K, V>
  implements ImplementsAbstractLevelDOWN<K, V> {
  readonly type: string;
  db: LUP<K>;
  leveldown?: ALD<K>;
  handlers: WrappingHandler<V, K>;

  constructor(db: LUP<K>, handlers: WrappingHandler<V, K>) {
    super('');

    this.handlers = handlers;
    this.type = handlers.type;
    this.db = db;
  }

  _open(options: AbstractOpenOptions, cb: ErrorCallback) {
    this.db.open(err => {
      if (err) return cb(err);

      this.leveldown = this.handlers.down
        ? this.handlers.down(this.db)
        : ((this.db as any).db as ALD<K>);

      cb(undefined);
    });
  }

  _close(cb: ErrorCallback) {
    this.ifOpen(cb, db => db.close(cb));
  }

  _get(key: K, options: AbstractGetOptions, cb: ErrorValueCallback<V>) {
    cb = complexErrorValueCallback(cb, { key, type: this.type });
    this.ifOpen(cb, db =>
      this.handlers.get
        ? this.handlers.get(db, key, options, cb)
        : db.get(key, options, cb)
    );
  }

  _put(key: K, value: V, options: AbstractOptions, cb: ErrorCallback) {
    this.ifOpen(cb, db => this.handlers.put(db, key, value, options, cb));
  }

  _del(key: K, options: AbstractOptions, cb: ErrorCallback) {
    this.ifOpen(cb, db => this.handlers.del(db, key, options, cb));
  }

  _batch(
    operations: AbstractBatch<K, V>[],
    options: AbstractOptions,
    cb: ErrorCallback
  ) {
    this.ifOpen(cb, db => this.handlers.batch(db, operations, options, cb));
  }

  _iterator(options: AbstractIteratorOptions<K>): AbstractIterator<K, V> {
    if (this.leveldown === undefined) {
      throw new Error('not open yet');
    }

    return this.handlers.iterator
      ? this.handlers.iterator(this, this.leveldown, options)
      : this.leveldown.iterator(options);
  }

  private ifOpen(
    cb: ErrorCallback | ErrorValueCallback<V>,
    fn: (db: ALD<K>) => void
  ) {
    if (this.leveldown) {
      fn(this.leveldown);
    } else {
      (cb as ErrorCallback)(new Error('not open yet'));
    }
  }
}

function complexErrorValueCallback<V>(cb: ErrorValueCallback<V>, opts: any) {
  return (err: Error | undefined, value: V) => {
    if (err) {
      err = new ComplexError(err, opts);
    }

    cb(err, value);
  };
}
