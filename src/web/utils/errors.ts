export function reportError(err: any, opts?: any) {
  if (typeof err === 'function') {
    try {
      const res = err();
      if (res instanceof Promise) {
        res.catch(reportError);
      }
    } catch (e) {
      reportError(e);
    }
  } else {
    if (!opts) {
      opts = {};
    }
    opts.err = err;
    console.error(opts);
    console.error(err);
  }
}
