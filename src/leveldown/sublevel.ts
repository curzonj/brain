import { Bytes } from 'leveldown';
import wrap from 'level-option-wrap';
import {
  AbstractLevelDOWN,
  ErrorCallback,
  AbstractIterator,
  AbstractIteratorOptions,
  AbstractGetOptions,
  ErrorValueCallback,
  ErrorKeyValueCallback,
  AbstractOptions,
} from 'abstract-leveldown';
import {
  WrappedAbstract,
  WrappingHandler,
  WritableBatch,
  LUP,
} from './wrap_abstract';

interface SublevelOptions {
  separator?: string;
}

interface OptionsWrapper<K extends Bytes> {
  gt: (x: K) => K;
  lt: (x: K) => K;
}

type ALD<K> = AbstractLevelDOWN<K, any>;

class Sublevel<V, K extends Bytes> implements WrappingHandler<V, K> {
  readonly type = 'sublevel';
  prefix: string;
  _wrapper: OptionsWrapper<K>;

  constructor(prefix: string = '', opts: SublevelOptions = {}) {
    this.prefix = buildPrefix(prefix, opts.separator);
    this._wrapper = buildWrapper<K>(() => this.prefix);
  }

  down(db: ALD<K>): ALD<K> | undefined {
    const subdb = down(db, this.type);
    if (subdb && subdb.prefix) {
      this.prefix = subdb.prefix + this.prefix;

      return down(subdb.db);
    }

    return down(db);
  }

  get(
    db: ALD<K>,
    key: K,
    options: AbstractGetOptions,
    cb: ErrorValueCallback<V>
  ) {
    db.get(concat(this.prefix, key), options, cb);
  }

  put(
    db: ALD<K>,
    key: K,
    value: V,
    options: AbstractOptions,
    cb: ErrorCallback
  ) {
    db.put(concat(this.prefix, key), value, options, cb);
  }

  del(db: ALD<K>, key: K, options: AbstractOptions, cb: ErrorCallback) {
    db.del(concat(this.prefix, key), options, cb);
  }

  batch(
    db: ALD<K>,
    operations: WritableBatch<K, V>[],
    options: AbstractOptions,
    cb: ErrorCallback
  ) {
    // No need to make a copy of the array, abstract-leveldown does that
    for (var i = 0; i < operations.length; i++) {
      operations[i].key = concat(this.prefix, operations[i].key);
    }

    db.batch(operations, options, cb);
  }

  iterator(
    src: ALD<K>,
    leveldown: ALD<K>,
    options: AbstractIteratorOptions<K>
  ): AbstractIterator<K, V> {
    const xopts = addRestOptions(
      wrap(fixRange(options), this._wrapper),
      options
    );
    return new SubIterator(src, leveldown.iterator(xopts), this.prefix);
  }
}

class SubIterator<V, K extends Bytes> extends AbstractIterator<K, V> {
  iterator: AbstractIterator<K, V>;
  prefix: string;
  constructor(
    db: AbstractLevelDOWN<K, V>,
    ite: AbstractIterator<K, V>,
    prefix: string
  ) {
    super(db);

    this.iterator = ite;
    this.prefix = prefix;
  }

  _next(cb: ErrorKeyValueCallback<K, V>) {
    this.iterator.next((err, key, value) => {
      if (err) return (cb as ErrorCallback)(err);
      if (key) key = key.slice(this.prefix.length) as K;
      cb(err, key, value);
    });
  }
  _seek(key: K) {
    this.iterator.seek(concat(this.prefix, key));
  }
  _end(cb: ErrorCallback) {
    this.iterator.end(cb);
  }
}
function compatibleConstructor<V, K extends Bytes = string>(
  db: LUP<K>,
  prefix: string = '',
  options: SublevelOptions = {}
): AbstractLevelDOWN<K, V> {
  return new WrappedAbstract(db, new Sublevel(prefix, options));
}

function fixRange<K extends Bytes>(
  opts: AbstractIteratorOptions<K>
): AbstractIteratorOptions<K> {
  return !opts.reverse || (!opts.end && !opts.start)
    ? opts
    : { start: opts.end, end: opts.start };
}

function addRestOptions<K extends Bytes>(
  target: AbstractIteratorOptions<K>,
  opts: AbstractIteratorOptions<K>
): AbstractIteratorOptions<K> {
  for (const k in opts) {
    if (Object.hasOwnProperty.call(opts, k) && !isRangeOption(k)) {
      (target as any)[k] = opts[k];
    }
  }

  return target;
}

const rangeOptions = 'start end gt gte lt lte'.split(' ');
function isRangeOption(k: string) {
  return rangeOptions.indexOf(k) !== -1;
}

function buildPrefix(prefix: string, separator: string = '!'): string {
  if (prefix[0] === separator) prefix = prefix.slice(1);
  if (prefix[prefix.length - 1] === separator) prefix = prefix.slice(0, -1);

  return separator + prefix + separator;
}

const ENDbuf = Buffer.from([0xff]);
const ENDstr = '\xff';
function buildWrapper<K extends Bytes>(
  prefix: () => string
): OptionsWrapper<K> {
  return {
    gt: function(x: K) {
      return concat<K>(prefix(), x || '', true);
    },
    lt: function(x: K) {
      if (Buffer.isBuffer(x)) {
        if (!x.length) {
          x = ENDbuf as K;
        }

        return concat<K>(prefix(), x);
      }

      return concat<K>(prefix(), x || ENDstr);
    },
  };
}

function concat<K extends Bytes>(
  prefix: string,
  key: Bytes,
  force: boolean = false
): K {
  if (!(force || key.length)) {
    return key as K;
  }

  if (typeof key === 'string') {
    return (prefix + key) as K;
  } else if (Buffer.isBuffer(key)) {
    return Buffer.concat([Buffer.from(prefix), key]) as K;
  }

  throw new Error('key must be a string or a buffer');
}

function down<DB extends AbstractLevelDOWN>(
  db: DB,
  type?: string
): DB | undefined {
  if (typeof db.down === 'function') return db.down(type);
  if (type && db.type === type) return db;
  if (isLooseAbstract(db.db)) return down(db.db, type);
  if (isLooseAbstract(db._db)) return down(db._db, type);
  return type ? undefined : db;
}

function isLooseAbstract(db: any) {
  if (!db || typeof db !== 'object') {
    return false;
  }
  return typeof db._batch === 'function' && typeof db._iterator === 'function';
}

export default compatibleConstructor;
