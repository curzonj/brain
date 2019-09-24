import levelup, { LevelUp } from 'levelup';
import leveljs from 'level-js';
import sublevel from 'subleveldown';
import {
  AbstractLevelDOWN,
  AbstractIterator,
  AbstractBatch,
} from 'abstract-leveldown';

import * as models from '../../common/models';

interface TypedLevelUp<V>
  extends LevelUp<AbstractLevelDOWN<string, V>, AbstractIterator<string, V>> {
  sub(name: string): TypedLevelUp<V>;
}

const base: TypedLevelUp<any> = levelup(leveljs('wiki')) as TypedLevelUp<any>;

function subTyped<V = any>(
  db: TypedLevelUp<any>,
  name: string
): TypedLevelUp<V> {
  const obj = sublevel(db, name, { valueEncoding: 'id' }) as TypedLevelUp<V>;
  obj.sub = (name: string) => subTyped<V>(obj as TypedLevelUp<V>, name);

  return obj;
}

export const namespaces = {
  batch: async (b: AbstractBatch[]) => base.batch(b),
  topics: subTyped<models.Doc>(base, 'topics'),
  configs: subTyped<any>(base, 'configs'),
  notes: subTyped<models.NewNote>(base, 'notes'),
};

export async function iteratorEach<K, V>(
  iter: AbstractIterator<K, V>,
  fn: (k: K, v: V) => void | Promise<void>
) {
  function next(resolve: () => void, reject: (e: Error) => void) {
    iter.next((err, k, v) => {
      if (err) {
        reject(err);
        return;
      }

      if (k === undefined && v === undefined) {
        resolve();
        return;
      }

      try {
        const ret = fn(k, v);
        Promise.resolve(ret)
          .then(() => next(resolve, reject))
          .catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  await new Promise(next);
}
