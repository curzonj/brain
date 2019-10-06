const enableProfiling = localStorage.enableProfiling;
const enableTiming = localStorage.enableTiming;

export function printTiming() {
  const list = performance.getEntriesByName('measure');
  console.log(list);
}
(window as any).printTiming = printTiming;

export async function wrapTiming<T>(
  label: string,
  threshold: number,
  fn: () => Promise<T>
): Promise<T> {
  if (!enableTiming || !label.startsWith(enableTiming)) return fn();

  const start = `${label}-start`;
  const end = `${label}-end`;

  performance.mark(start);

  const ret = await fn();

  performance.mark(end);
  performance.measure(label, start, end);
  performance.clearMarks(start);
  performance.clearMarks(end);

  const list = performance.getEntriesByName(label, 'measure');
  for (let m of list) {
    if (m.duration < threshold) {
      performance.clearMeasures(label);
    } else {
      console.log(m);
    }
  }

  return ret;
}
export async function wrapProfiling<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!enableProfiling || enableProfiling !== label) return fn();

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
