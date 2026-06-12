import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface TenantAuditQuery {
  method?: string;
  entity?: string;
  statusCode?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

interface AuditEntry {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string;
  diff?: Record<string, unknown>;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  actorType?: 'PLATFORM_ADMIN' | 'USER';
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId ?? null,
          userId: entry.userId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          diff: (entry.diff as any) ?? undefined,
          method: entry.method ?? null,
          path: entry.path ?? null,
          statusCode: entry.statusCode ?? null,
          durationMs: entry.durationMs ?? null,
          actorType: entry.actorType ?? null,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
        },
      });
    } catch (err) {
      // Audit failures must never break the operation that triggered them.
      this.logger.warn(`Failed to write audit entry: ${(err as Error).message}`);
    }
  }

  /** Build the Prisma `where` for a tenant-scoped audit query. */
  private tenantWhere(tenantId: string, q: TenantAuditQuery): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = { tenantId };
    if (q.method) where.method = q.method.toUpperCase();
    if (q.entity) where.entity = { contains: q.entity, mode: 'insensitive' };
    if (q.statusCode) where.statusCode = Number(q.statusCode);
    if (q.dateFrom || q.dateTo) {
      where.createdAt = {};
      if (q.dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(q.dateFrom);
      if (q.dateTo) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(`${q.dateTo}T23:59:59.999Z`);
    }
    if (q.search) {
      where.OR = [
        { path: { contains: q.search, mode: 'insensitive' } },
        { action: { contains: q.search, mode: 'insensitive' } },
        { entity: { contains: q.search, mode: 'insensitive' } },
        { ip: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  /** Paginated audit trail for a single tenant (the tenant-admin viewer). */
  async listForTenant(tenantId: string, q: TenantAuditQuery) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const where = this.tenantWhere(tenantId, q);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { fullName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data: rows, total, page, limit };
  }

  /** Flat rows for CSV export — capped so a tenant can't pull an unbounded set. */
  async exportForTenant(tenantId: string, q: TenantAuditQuery) {
    return this.prisma.auditLog.findMany({
      where: this.tenantWhere(tenantId, q),
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: { user: { select: { fullName: true, email: true } } },
    });
  }
}
