module.exports = {
  reportError(err, opts) {
    if (!opts) {
      opts = {};
    }
    opts.err = err;
    console.error(opts);
    console.error(err);
  },
};
