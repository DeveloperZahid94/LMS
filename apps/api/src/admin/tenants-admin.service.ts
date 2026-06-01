import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { FeatureKey } from '@lms/shared';
import { DEFAULT_EXAM_TARGETS } from '../exam-targets/exam-targets.service';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateTenantDto {
  @IsString() name!: string;
  @IsString() slug!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() adminEmail!: string;
  @IsString() adminFullName!: string;
  @IsString() adminPassword!: string;
}

@Injectable()
export class TenantsAdminService {
  constructor(
    private prisma: PrismaService,
    private featureFlags: FeatureFlagsService,
  ) {}

  list() {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { branches: true, users: true, students: true } } },
    });
  }

  async create(dto: CreateTenantDto) {
    const hash = await bcrypt.hash(dto.adminPassword, 10);
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name, slug: dto.slug, email: dto.email, phone: dto.phone ?? null,
        },
      });
      const branch = await tx.branch.create({
        data: { tenantId: tenant.id, name: 'Headquarters', code: 'HQ' },
      });
      await tx.user.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          email: dto.adminEmail,
          passwordHash: hash,
          fullName: dto.adminFullName,
          role: 'CLIENT_ADMIN',
        },
      });
      // Default feature flags: all on (SuperAdmin can disable per tenant after).
      for (const key of Object.values(FeatureKey)) {
        await tx.featureFlag.create({
          data: { tenantId: tenant.id, key: key as any, enabled: true },
        });
      }
      // Default exam targets — same list the migration seeds for existing tenants.
      await tx.examTarget.createMany({
        data: DEFAULT_EXAM_TARGETS.map((name) => ({ tenantId: tenant.id, name, isCustom: false })),
        skipDuplicates: true,
      });
      return tenant;
    });
  }

  setStatus(tenantId: string, status: 'ACTIVE' | 'SUSPENDED' | 'TRIAL' | 'CANCELLED') {
    return this.prisma.tenant.update({ where: { id: tenantId }, data: { status } });
  }
}
