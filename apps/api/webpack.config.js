const { composePlugins, withNx } = require('@nx/webpack');

module.exports = composePlugins(withNx({ target: 'node' }), (config) => {
  // Bundle the workspace shared lib instead of leaving it as an external require.
  // Node.js can't import from libs/shared/src/index.ts directly at runtime, and
  // bundling avoids needing a separate build step for the lib.
  const externals = config.externals;
  const keepBundled = (req) =>
    req === '@lms/shared' || (typeof req === 'string' && req.startsWith('@lms/shared/'));

  const wrap = (fn) => (ctx, cb) => {
    const req = ctx && ctx.request;
    if (keepBundled(req)) return cb();
    return fn(ctx, cb);
  };

  if (typeof externals === 'function') {
    config.externals = wrap(externals);
  } else if (Array.isArray(externals)) {
    config.externals = externals.map((e) => (typeof e === 'function' ? wrap(e) : e));
  }
  return config;
});
