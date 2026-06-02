import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditQuery {
  tenantId?: string;
  userId?: string;
  action?: string;
  entity?: string;
  method?: string;
  statusCode?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditAdminService {
  constructor(private prisma: PrismaService) {}

  async list(q: AuditQuery) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));

    const where: Prisma.AuditLogWhereInput = {};
    if (q.tenantId) where.tenantId = q.tenantId;
    if (q.userId) where.userId = q.userId;
    if (q.action) where.action = { contains: q.action, mode: 'insensitive' };
    if (q.entity) where.entity = { contains: q.entity, mode: 'insensitive' };
    if (q.method) where.method = q.method.toUpperCase();
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

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { fullName: true, email: true } },
          tenant: { select: { name: true, slug: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data: rows, total, page, limit };
  }
}
