import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { FeatureKey } from '@lms/shared';
import { DEFAULT_EXAM_TARGETS } from '../exam-targets/exam-targets.service';
import * as bcrypt from 'bcryptjs';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString() name!: string;
  @IsString() slug!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() adminEmail!: string;
  @IsString() adminFullName!: string;
  @IsString() adminPassword!: string;
}

export class ResetPasswordDto {
  @IsOptional() @IsString() @MinLength(8) newPassword?: string;
}

export class SetUserActiveDto {
  @IsBoolean() isActive!: boolean;
}

/** Readable temp password, e.g. "Lms-7K4P-92" — easy to share over WhatsApp/call. */
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const block = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `Lms-${block(4)}-${block(2)}`;
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

  async detail(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: { select: { branches: true, users: true, students: true } },
        users: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true, email: true, fullName: true, role: true, isActive: true,
            mustChangePassword: true, lastLoginAt: true, passwordChangedAt: true,
          },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const features = await this.featureFlags.listForTenant(tenantId);
    return { ...tenant, features };
  }

  /** Sets (or generates) a temp password for a tenant user and forces a change on next login. */
  async resetUserPassword(tenantId: string, userId: string, newPassword?: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException('User not found in this tenant');
    const tempPassword = newPassword ?? generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date() },
    });
    return { userId, tempPassword };
  }

  async setUserActive(tenantId: string, userId: string, isActive: boolean) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException('User not found in this tenant');
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, isActive: true },
    });
  }
}
