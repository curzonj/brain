export function reportError(err: any, opts?: any) {
  if (!opts) {
    opts = {};
  }
  opts.err = err;
  console.error(opts);
  console.error(err);
}
