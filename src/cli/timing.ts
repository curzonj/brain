import * as util from 'util';

let timings = {} as {
  [key: string]: number[];
};

export function resetTimings() {
  timings = {};
}

export function printTimings() {
  process.stdout.write('\n');

  Object.keys(timings).forEach((name: string) => {
    const a = timings[name];
    const max = a.reduce((acc, n) => (acc > n ? acc : n));
    const total = a.reduce((acc, n) => acc + n);
    const avg = total / a.length;

    process.stdout.write(
      util.format(
        'timing name=%s count=%d avg=%d max=%d total=%d\n',
        name,
        a.length,
        avg.toFixed(2),
        max.toFixed(2),
        total.toFixed(2)
      )
    );
  });
}

function atFinish(name: string, hrstart: [number, number]) {
  const hrend = process.hrtime(hrstart);
  const ms = hrend[1] / 1000000 + hrend[0] * 1000;

  if (!timings[name]) {
    timings[name] = [] as number[];
  }

  timings[name].push(ms);
}

export function timingSync<T>(name: string, fn: () => T): T {
  const hrstart = process.hrtime();

  try {
    return fn();
  } finally {
    atFinish(name, hrstart);
  }
}

export async function timingAsync<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const hrstart = process.hrtime();

  return fn().finally(() => atFinish(name, hrstart));
}
