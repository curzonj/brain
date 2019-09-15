export function groupBy<T>(xs: T[], fn: (x: T) => string|undefined): Array<[string, T[]]>  {
  const hashed = xs.reduce((rv, x) => {
    const key = fn(x);
    if (key) {
      (rv[key] = rv[key] || [] as T[]).push(x);
    }
    return rv;
  }, {} as Record<string,T[]>);

  return Object.entries(hashed);
}
