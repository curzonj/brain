// TODO implement eachOfLimit

export async function eachOfLimit<T>(
  list: T[],
  limit: number,
  fn: (t: T, i: number, l: T[]) => Promise<void>
): Promise<void> {
  await Promise.all(list.map(fn));
}
