// TODO implement eachOfLimit
import { catchError } from './errors';
import debug from './debug';

export async function eachOfLimit<T>(
  list: T[],
  limit: number,
  fn: (t: T, i: number, l: T[]) => Promise<void>
): Promise<void> {
  await Promise.all(list.map(fn));

  await new Promise((resolve, reject) => {
    const iter = list[Symbol.iterator]();
    let index = 0;
    let running = 0;
    //let runningList: T[] = [];
    let done = false;

    function next() {
      const { value, done: iterDone } = iter.next();
      if (iterDone) {
        done = true;
        if (running <= 0) resolve();
        return;
      }
      const innerIndex = index + 1;
      index += 1;

      running += 1;
      //runningList.push(value);
      catchError(async () =>
        fn(value, innerIndex, list)
          .finally(() => {
            running -= 1;
            //runningList = runningList.filter(i => i !== value);
          })
          .then(() => {
            replenish();
          })
          .catch((err: any) => {
            done = true;
            reject(err);
          })
      );
    }

    function replenish() {
      while (running < limit && !done) {
        next();
      }
      /*debug.trace(
        'eachOfLimit.replenish running=%s done=%s running=%O',
        running,
        done,
        runningList
      );*/

      if (done && running <= 0) resolve();
    }

    replenish();
  });
}
