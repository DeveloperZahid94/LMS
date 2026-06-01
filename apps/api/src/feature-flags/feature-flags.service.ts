import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureKey, FeatureFlag } from '@lms/shared';

@Injectable()
export class FeatureFlagsService {
  // Small in-memory cache per process to avoid hitting Postgres on every request.
  // Invalidated whenever a flag is updated via setForTenant().
  private cache = new Map<string, { ts: number; flags: FeatureFlag[] }>();
  private readonly TTL_MS = 60_000;

  constructor(private prisma: PrismaService) {}

  async listForTenant(tenantId: string): Promise<FeatureFlag[]> {
    const cached = this.cache.get(tenantId);
    if (cached && Date.now() - cached.ts < this.TTL_MS) return cached.flags;

    const rows = await this.prisma.featureFlag.findMany({ where: { tenantId } });
    const flags: FeatureFlag[] = rows.map((r) => ({
      key: r.key as unknown as FeatureKey,
      enabled: r.enabled,
      config: (r.config as Record<string, unknown> | null) ?? undefined,
    }));
    this.cache.set(tenantId, { ts: Date.now(), flags });
    return flags;
  }

  async isEnabled(tenantId: string, key: FeatureKey): Promise<boolean> {
    const flags = await this.listForTenant(tenantId);
    return flags.find((f) => f.key === key)?.enabled ?? false;
  }

  async setForTenant(tenantId: string, key: FeatureKey, enabled: boolean) {
    const row = await this.prisma.featureFlag.upsert({
      where: { tenantId_key: { tenantId, key: key as any } },
      update: { enabled },
      create: { tenantId, key: key as any, enabled },
    });
    this.cache.delete(tenantId);
    return row;
  }
}
