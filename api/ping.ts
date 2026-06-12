// Bare diagnostic function — NO imports, no Nest, no DB. Returns instantly.
// If THIS hangs/504s, the problem is the Vercel function/deploy itself, not our
// NestJS app. If it returns 200 fast, the hang is in loading/initialising Nest.
export default function handler(_req: any, res: any) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      ok: true,
      build: 'ping-1',
      node: process.version,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown',
    }),
  );
}
