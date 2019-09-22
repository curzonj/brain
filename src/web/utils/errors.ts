export function reportError(err: any, opts?: any) {
  if (typeof err === 'function') {
    Promise.resolve()
      .then(err)
      .catch(e => reportError(e, opts));
  } else {
    if (!opts) {
      opts = {};
    }
    opts.err = err;
    console.error(opts);
    console.error(err);
  }
}
