// Isolates Prisma/DB from Nest. No Nest, no app.module. Dynamically imports
// @prisma/client, connects with a sanitized URL, runs SELECT 1 with a 9s cap.
// - returns {ok:true} → DB reachable, so the Nest hang is NOT Prisma.
// - returns {ok:false,error} → the exact DB/connection error.
// - hangs (504) → requiring @prisma/client itself blocks the event loop.
export default async function handler(_req: any, res: any) {
  const send = (obj: any) => {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(obj));
  };
  const t0 = Date.now();
  try {
    const { PrismaClient } = await import('@prisma/client');
    const loadedMs = Date.now() - t0;

    let url = process.env.DATABASE_URL || '';
    try {
      const u = new URL(url);
      u.searchParams.delete('channel_binding');
      if (u.hostname.includes('-pooler')) u.searchParams.set('pgbouncer', 'true');
      u.searchParams.set('connect_timeout', '8');
      url = u.toString();
    } catch { /* keep raw */ }

    const prisma = new PrismaClient({ datasources: { db: { url } } } as any);
    const result = await Promise.race([
      (prisma as any).$queryRaw`SELECT 1 as ok`.then(() => 'reachable'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB query timed out after 9s')), 9000)),
    ]);
    await (prisma as any).$disconnect().catch(() => undefined);
    send({ ok: true, db: result, clientLoadMs: loadedMs, totalMs: Date.now() - t0, build: 'dbtest-1' });
  } catch (e: any) {
    send({ ok: false, error: e?.message ?? String(e), totalMs: Date.now() - t0, build: 'dbtest-1' });
  }
}
