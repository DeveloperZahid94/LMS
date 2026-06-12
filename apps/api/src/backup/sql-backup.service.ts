import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Generates a restorable, data-only SQL dump (INSERT statements) without relying
 * on pg_dump — which isn't available in the serverless runtime.
 *
 *  - Full mode (SuperAdmin): every row of every table.
 *  - Tenant mode (tenant admin): only the caller's tenant. Every domain table
 *    carries a `tenantId`, so we filter on it; the `tenants` row is selected by
 *    id, and platform-level tables (platform_admins) are skipped.
 *
 * Tables are emitted parent-before-child (topological order on foreign keys) and
 * each INSERT uses ON CONFLICT DO NOTHING, so the file restores cleanly into a
 * fresh schema and is safe to re-run:
 *    psql "$DATABASE_URL" -f backup.sql
 * (the schema must already exist — create it with `prisma migrate deploy`).
 */
@Injectable()
export class SqlBackupService {
  private readonly logger = new Logger(SqlBackupService.name);

  constructor(private prisma: PrismaService) {}

  async dumpFull(): Promise<string> {
    return this.build(null);
  }

  async dumpTenant(tenantId: string): Promise<string> {
    return this.build(tenantId);
  }

  private async build(tenantId: string | null): Promise<string> {
    const columns = await this.columnsByTable();
    const order = await this.topologicalOrder(Object.keys(columns));
    const colNames = (t: string) => columns[t].map((c) => c.name);

    const scope = tenantId ? `TENANT ${tenantId}` : 'FULL DATABASE';
    const out: string[] = [
      `-- LMS SQL backup`,
      `-- Scope: ${scope}`,
      `-- Restore into a database that already has the schema (prisma migrate deploy):`,
      `--   psql "$DATABASE_URL" -f this-file.sql`,
      `SET statement_timeout = 0;`,
      `SET client_encoding = 'UTF8';`,
      `BEGIN;`,
      ``,
    ];

    for (const table of order) {
      const cols = columns[table];
      if (!cols) continue;
      const names = colNames(table);
      const where = this.whereFor(table, names, tenantId);
      if (where === SKIP) continue;

      let rows: Record<string, unknown>[];
      try {
        rows = tenantId && where
          ? await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${table}"${where}`, tenantId)
          : await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${table}"`);
      } catch (err) {
        this.logger.warn(`Skipping table ${table}: ${(err as Error).message}`);
        continue;
      }
      if (!rows.length) continue;

      const colList = names.map((c) => `"${c}"`).join(', ');
      out.push(`-- ${table} (${rows.length} rows)`);
      for (const row of rows) {
        const values = cols.map((c) => fmtValue(row[c.name], c)).join(', ');
        out.push(`INSERT INTO "${table}" (${colList}) VALUES (${values}) ON CONFLICT DO NOTHING;`);
      }
      out.push('');
    }

    out.push('COMMIT;', '');
    return out.join('\n');
  }

  /** table -> ordered column metadata (name + Postgres type). */
  private async columnsByTable(): Promise<Record<string, ColumnMeta[]>> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ table_name: string; column_name: string; data_type: string; udt_name: string }>
    >(
      `SELECT table_name, column_name, data_type, udt_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position`,
    );
    const map: Record<string, ColumnMeta[]> = {};
    for (const r of rows) {
      (map[r.table_name] ??= []).push({ name: r.column_name, dataType: r.data_type, udtName: r.udt_name });
    }
    return map;
  }

  /** Order tables so a table's FK targets come first (Kahn's algorithm). */
  private async topologicalOrder(tables: string[]): Promise<string[]> {
    const deps = await this.prisma.$queryRawUnsafe<Array<{ child: string; parent: string }>>(
      `SELECT tc.table_name AS child, ccu.table_name AS parent
         FROM information_schema.table_constraints tc
         JOIN information_schema.constraint_column_usage ccu
           ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
    );
    const set = new Set(tables);
    const parents: Record<string, Set<string>> = {};
    for (const t of tables) parents[t] = new Set();
    for (const d of deps) {
      if (d.child === d.parent) continue; // self-reference: ignore
      if (set.has(d.child) && set.has(d.parent)) parents[d.child].add(d.parent);
    }
    const ordered: string[] = [];
    const done = new Set<string>();
    // Stable: alphabetical among ready tables for deterministic output.
    const remaining = [...tables].sort();
    let progressed = true;
    while (remaining.length && progressed) {
      progressed = false;
      for (let i = 0; i < remaining.length; i++) {
        const t = remaining[i];
        if ([...parents[t]].every((p) => done.has(p))) {
          ordered.push(t);
          done.add(t);
          remaining.splice(i, 1);
          progressed = true;
          i--;
        }
      }
    }
    // Any leftovers (cycles) — append as-is; ON CONFLICT keeps restore safe.
    ordered.push(...remaining);
    return ordered;
  }

  /** Returns the WHERE clause (with $1 = tenantId), '' for full, or SKIP to omit the table. */
  private whereFor(table: string, cols: string[], tenantId: string | null): string {
    if (!tenantId) return '';
    if (table === 'tenants') return ` WHERE "id" = $1`;
    if (cols.includes('tenantId')) return ` WHERE "tenantId" = $1`;
    return SKIP; // platform-level table (e.g. platform_admins) — not part of a tenant backup
  }
}

const SKIP = '\0skip';

interface ColumnMeta {
  name: string;
  dataType: string; // information_schema data_type, e.g. 'ARRAY', 'jsonb', 'numeric'
  udtName: string; // e.g. '_text' for text[], 'jsonb', 'numeric', 'timestamptz'
}

/** A single SQL-quoted scalar (no array/json wrapping). */
function quoteScalar(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Format a JS value (as returned by the pg driver) as a SQL literal for its column type. */
function fmtValue(v: unknown, col: ColumnMeta): string {
  if (v === null || v === undefined) return 'NULL';

  // Native Postgres arrays (text[], int[], ...). udtName is '_<elem>'.
  if (col.dataType === 'ARRAY' && Array.isArray(v)) {
    const elem = col.udtName.replace(/^_/, '');
    if (!v.length) return `'{}'::${elem}[]`;
    return `ARRAY[${v.map(quoteScalar).join(', ')}]::${elem}[]`;
  }

  // JSON / JSONB columns — serialise the object/array/scalar as a JSON literal.
  if (col.dataType === 'jsonb' || col.dataType === 'json') {
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::${col.dataType}`;
  }

  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) return `'\\x${v.toString('hex')}'`;
  if (typeof v === 'object') {
    const o = v as { toString(): string; toFixed?: unknown; toNumber?: unknown; constructor?: { name?: string } };
    // Prisma.Decimal / numeric values arrive as objects with a numeric toString().
    if (typeof o.toFixed === 'function' || typeof o.toNumber === 'function' || o.constructor?.name === 'Decimal') {
      const s = o.toString();
      return /^-?\d+(\.\d+)?$/.test(s) ? s : `'${s.replace(/'/g, "''")}'`;
    }
    // Fallback for any other object (shouldn't happen for non-json columns).
    return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}
