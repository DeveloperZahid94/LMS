import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Normalises DATABASE_URL for serverless + Neon so a bad/edge-case connection
 * string can't hang the function:
 *  - drops `channel_binding` (Prisma's engine can stall on it with PgBouncer),
 *  - forces `sslmode=require`,
 *  - enables `pgbouncer=true` for Neon's `-pooler` host,
 *  - sets a short `connect_timeout` so a connect FAILS fast (logged 500) instead
 *    of hanging until the Lambda times out (opaque 504, no logs).
 */
function resilientDbUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    u.searchParams.delete('channel_binding');
    if (!u.searchParams.has('sslmode')) u.searchParams.set('sslmode', 'require');
    if (u.hostname.includes('-pooler')) u.searchParams.set('pgbouncer', 'true');
    if (!u.searchParams.has('connect_timeout')) u.searchParams.set('connect_timeout', '8');
    return u.toString();
  } catch {
    return raw;
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const url = resilientDbUrl();
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
      ...(url ? { datasources: { db: { url } } } : {}),
    });
  }

  onModuleInit() {
    // Never await: on serverless an unreachable DB would hang the whole app
    // bootstrap → every route 504s with no logs. Connect in the background.
    this.$connect().catch((err) =>
      this.logger.error(`Prisma initial $connect failed: ${(err as Error).message}`),
    );
  }

  async onModuleDestroy() {
    await this.$disconnect().catch(() => undefined);
  }
}
