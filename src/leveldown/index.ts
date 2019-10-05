import LevelUp from 'levelup';
import { Bytes } from 'leveldown';
import encoding from 'encoding-down';
import sublevel from './sublevel';
import {
  AbstractLevelDOWN,
  AbstractIterator,
  AbstractIteratorOptions,
} from 'abstract-leveldown';

export class LevelWrapper<V, K extends Bytes = string>
  extends LevelUp<AbstractLevelDOWN<K, V>, AbstractIterator<K, V>>
  implements AbstractLevelDOWN<K, V> {
  constructor(db: AbstractLevelDOWN<K, V>) {
    super(encoding<K, V>(db, { valueEncoding: 'id' }));
  }

  sub<VS = V>(name: string) {
    return new LevelWrapper<VS, K>(sublevel<VS, K>(this, name));
  }

  async forEach(
    options: AbstractIteratorOptions,
    fn: (k: K, v: V) => void | Promise<void>
  ) {
    return new Promise((resolve, reject) => {
      const iter = this.iterator(options);

      function next() {
        iter.next((err, key, value) => {
          if (err) {
            iter.end(err2 => {
              reject(err);
            });
          } else {
            if (key && value) {
              Promise.resolve()
                .then(async () => fn(key, value))
                .then(next, reject);
            } else {
              iter.end(err2 => {
                if (err2) {
                  reject(err2);
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
