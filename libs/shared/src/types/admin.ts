import { UserRole } from './roles';
import { FeatureFlag } from './features';

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL' | 'CANCELLED';

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string | null;
  status: TenantStatus;
  plan: string;
  createdAt: string;
  _count?: { branches: number; users: number; students: number };
}

export interface TenantUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
}

export interface TenantDetail extends TenantSummary {
  users: TenantUser[];
  features: FeatureFlag[];
}

export interface ResetPasswordResult {
  userId: string;
  tempPassword: string;
}

export interface AuditLogRow {
  id: string;
  tenantId: string | null;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  durationMs: number | null;
  actorType: string | null;
  ip: string | null;
  createdAt: string;
  diff: Record<string, unknown> | null;
  user: { fullName: string; email: string } | null;
  tenant: { name: string; slug: string } | null;
}

export type DbQueryKind = 'read' | 'write';

export interface DbQueryResult {
  kind: DbQueryKind;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  /** Set when a write/DDL statement needs explicit confirmation before running. */
  requiresConfirmation?: boolean;
}

export interface DbTableCount {
  table: string;
  rows: number;
}

export interface DbSlowQuery {
  query: string;
  calls: number;
  meanMs: number;
  totalMs: number;
}

export interface DbStats {
  databaseSize: string;
  activeConnections: number;
  totals: { tenants: number; users: number; students: number; payments: number };
  tables: DbTableCount[];
  slowQueries: DbSlowQuery[];
  slowQueriesAvailable: boolean;
}
