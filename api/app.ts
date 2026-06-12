// Vercel function: loads the PREBUILT webpack bundle (dist/apps/api/main.js) at
// runtime via an unanalyzable require so @vercel/node's esbuild never bundles
// NestJS (esbuild deadlocks bootstrapping Nest). The bundle is compiled by
// `nx build api` (tsc/webpack) which handles Nest correctly, and exports the
// Express-app request handler as its default export.
let cached: ((req: any, res: any) => any) | null = null;

export default async function handler(req: any, res: any) {
  try {
    if (!cached) {
      const base = process.env.LAMBDA_TASK_ROOT || process.cwd();
      // String concat keeps the path opaque to esbuild's static analysis, so it
      // stays a runtime require instead of being bundled.
      const bundlePath = base + '/dist/apps/api/' + 'main.js';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(bundlePath);
      cached = (mod && (mod.default || mod)) as (req: any, res: any) => any;
    }
    return cached(req, res);
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'API bundle load failed', detail: err?.message ?? String(err) }));
    return;
  }
}
