import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

const READ_LEADERS = new Set(['SELECT', 'WITH', 'EXPLAIN', 'SHOW', 'TABLE', 'VALUES']);
const STATEMENT_TIMEOUT_MS = 15_000;
const MAX_ROWS = 1000;

export interface RunQueryInput {
  sql: string;
  confirmWrite?: boolean;
}

interface Actor {
  userId?: string | null;
  ip?: string;
  userAgent?: string;
}

/** Recursively convert BigInt → number/string so results survive JSON serialization. */
function sanitize(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v)]));
  }
  return value;
}

@Injectable()
export class DbConsoleService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private classify(sql: string): 'read' | 'write' {
    const leader = sql.trim().replace(/^\(+/, '').split(/\s+/)[0]?.toUpperCase() ?? '';
    return READ_LEADERS.has(leader) ? 'read' : 'write';
  }

  async run(input: RunQueryInput, actor: Actor) {
    const sql = (input.sql ?? '').trim().replace(/;+\s*$/, '');
    if (!sql) throw new BadRequestException('SQL statement is empty');
    if (/;/.test(sql)) {
      throw new BadRequestException('Only a single statement may be run at a time');
    }

    const kind = this.classify(sql);

    // Write/DDL needs explicit confirmation — return a sentinel instead of executing.
    if (kind === 'write' && input.confirmWrite !== true) {
      return { kind, requiresConfirmation: true, columns: [], rows: [], rowCount: 0, durationMs: 0 };
    }

    const started = Date.now();
    let result: { columns: string[]; rows: Record<string, unknown>[]; rowCount: number };

    try {
      if (kind === 'read') {
        const limited = /\blimit\s+\d+/i.test(sql) ? sql : `${sql} LIMIT ${MAX_ROWS}`;
        const rows = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
          return tx.$queryRawUnsafe<Record<string, unknown>[]>(limited);
        });
        const clean = (sanitize(rows) as Record<string, unknown>[]) ?? [];
        result = {
          columns: clean.length ? Object.keys(clean[0]) : [],
          rows: clean,
          rowCount: clean.length,
        };
      } else {
        const affected = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
          return tx.$executeRawUnsafe(sql);
        });
        result = { columns: ['affectedRows'], rows: [{ affectedRows: affected }], rowCount: affected };
      }
    } catch (err) {
      // Audit the failed attempt too, then surface the DB error message.
      void this.audit.record({
        action: 'DB_QUERY_ERROR', entity: 'db_console', actorType: 'PLATFORM_ADMIN',
        userId: actor.userId, ip: actor.ip, userAgent: actor.userAgent,
        diff: { sql: sql.slice(0, 2000), kind, error: (err as Error).message },
      });
      throw new BadRequestException((err as Error).message);
    }

    const durationMs = Date.now() - started;
    void this.audit.record({
      action: 'DB_QUERY', entity: 'db_console', actorType: 'PLATFORM_ADMIN',
      userId: actor.userId, ip: actor.ip, userAgent: actor.userAgent, durationMs,
      diff: { sql: sql.slice(0, 2000), kind, rowCount: result.rowCount },
    });

    return { kind, durationMs, ...result };
  }

  async stats() {
    const [sizeRow, connRow, tenants, users, students, payments, tables] = await Promise.all([
      this.prisma.$queryRawUnsafe<{ size: string }[]>(
        `SELECT pg_size_pretty(pg_database_size(current_database())) AS size`,
      ),
      this.prisma.$queryRawUnsafe<{ c: number }[]>(
        `SELECT count(*)::int AS c FROM pg_stat_activity WHERE datname = current_database()`,
      ),
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.student.count(),
      this.prisma.payment.count(),
      this.prisma.$queryRawUnsafe<{ table: string; rows: number }[]>(
        `SELECT relname AS table, n_live_tup::int AS rows
           FROM pg_stat_user_tables
          ORDER BY n_live_tup DESC
          LIMIT 30`,
      ),
    ]);

    // pg_stat_statements is optional — degrade gracefully if the extension is absent.
    let slowQueries: { query: string; calls: number; meanMs: number; totalMs: number }[] = [];
    let slowQueriesAvailable = false;
    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT query, calls::int AS calls,
                round(mean_exec_time::numeric, 2)::float8 AS "meanMs",
                round(total_exec_time::numeric, 2)::float8 AS "totalMs"
           FROM pg_stat_statements
          ORDER BY total_exec_time DESC
          LIMIT 10`,
      );
      slowQueries = rows.map((r) => ({
        query: String(r.query).slice(0, 300), calls: r.calls, meanMs: r.meanMs, totalMs: r.totalMs,
      }));
      slowQueriesAvailable = true;
    } catch {
      slowQueriesAvailable = false;
    }

    return sanitize({
      databaseSize: sizeRow[0]?.size ?? '—',
      activeConnections: connRow[0]?.c ?? 0,
      totals: { tenants, users, students, payments },
      tables,
      slowQueries,
      slowQueriesAvailable,
    });
  }
}
