import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
}
