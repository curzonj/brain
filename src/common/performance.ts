import debug from './debug';
import { reportError } from './errors';

export function printTiming() {
  const list = performance.getEntriesByName('measure');
  console.dir(list);
}
(window as any).printTiming = printTiming;

// WARNING this function uses global labels and is not safe
// for concurrency.
// This can be wrapped around high frequency function calls
// and it will log function calls that take longer than the
// threshold
export async function wrapTiming<T>(
  label: string,
  threshold: number,
  fn: () => Promise<T>
): Promise<T> {
  if (!debug.performance.timing.enabled) return fn();

  const start = `${label}-start`;
  const end = `${label}-end`;

  performance.mark(start);

  const ret = await fn();

  try {
    performance.mark(end);
    performance.measure(label, start, end);
    performance.clearMarks(start);
    performance.clearMarks(end);

    const list = performance.getEntriesByName(label, 'measure');
    for (let m of list) {
      if (m.duration > threshold) {
        debug.performance.timing('%s %O', label, m);
      }
    }
    performance.clearMeasures(label);
  } catch (e) {
    reportError(e);
  }

  return ret;
}

// WARNING each profile is a bit expensive, only
// wrap this around functions called once or twice per page load
export async function wrapProfiling<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!debug.performance.profiling.enabled) return fn();

  if (console.profile) {
    console.profile(label);
  } else if (console.time) {
    console.time(label);
  }

  const ret = await fn();

  if (console.profileEnd) {
    console.profileEnd(label);
  } else if (console.timeEnd) {
    console.timeEnd(label);
  }

  return ret;
}
