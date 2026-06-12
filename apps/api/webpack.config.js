const { composePlugins, withNx } = require('@nx/webpack');

/**
 * Build the API as a SELF-CONTAINED CommonJS bundle that exports the serverless
 * handler. Everything (incl. @lms/shared and node_modules like @nestjs/*) is
 * bundled into one file EXCEPT @prisma/client — its native query engine must
 * stay a runtime require resolved from node_modules.
 *
 * Why: @vercel/node compiles functions with esbuild, which deadlocks while
 * bundling NestJS. So we ship a webpack-built (tsc) bundle and have the Vercel
 * function load it at runtime — esbuild never touches Nest.
 */
module.exports = composePlugins(withNx({ target: 'node' }), (config) => {
  // Bundle node_modules into the output, EXCEPT:
  //  - @prisma/client (native engine — runtime require from node_modules)
  //  - Nest's optional peers that aren't installed (microservices, websockets,
  //    cache-manager) — Nest guards these; keep them external so they fail-soft
  //    at runtime instead of breaking the bundle.
  const EXTERNAL_PREFIXES = [
    '@prisma/',
    '@nestjs/microservices',
    '@nestjs/websockets',
    'class-transformer/storage',
    'cache-manager',
  ];
  const isExternal = (r) =>
    typeof r === 'string' &&
    (r === '@prisma/client' ||
      r === '.prisma/client' ||
      EXTERNAL_PREFIXES.some((p) => r === p || r.startsWith(p)));

  config.externals = [
    ({ request }, cb) => (isExternal(request) ? cb(null, 'commonjs ' + request) : cb()),
  ];

  // Export module.exports so the Vercel function can `require()` the handler.
  config.output = { ...(config.output || {}), libraryTarget: 'commonjs2' };

  // Nest references several optional packages it doesn't actually use here
  // (microservices, websockets, etc.). Don't fail the build if they're absent.
  config.ignoreWarnings = [
    ...(config.ignoreWarnings || []),
    /Critical dependency/,
    /Can't resolve/,
  ];

  return config;
});
