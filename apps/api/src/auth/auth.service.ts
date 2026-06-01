import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { LoginDto } from './dto/login.dto';
import { UserRole, AuthResponse, JwtPayload } from '@lms/shared';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private featureFlags: FeatureFlagsService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponse> {
    // Try platform-admin first if no tenant supplied
    if (!dto.tenantSlug) {
      const platformAdmin = await this.prisma.platformAdmin.findUnique({
        where: { email: dto.email },
      });
      if (platformAdmin) {
        const ok = await bcrypt.compare(dto.password, platformAdmin.passwordHash);
        if (!ok) throw new UnauthorizedException('Invalid credentials');
        if (!platformAdmin.isActive) throw new UnauthorizedException('Account disabled');
        return this.buildAuthResponse(
          {
            id: platformAdmin.id,
            email: platformAdmin.email,
            fullName: platformAdmin.fullName,
            role: UserRole.SUPER_ADMIN,
            tenantId: null,
            tenantSlug: null,
            branchId: null,
          },
          [],
        );
      }
      throw new BadRequestException('tenantSlug is required for non-SuperAdmin login');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } });
    if (!tenant) throw new UnauthorizedException('Invalid tenant or credentials');
    if (tenant.status !== 'ACTIVE' && tenant.status !== 'TRIAL') {
      throw new UnauthorizedException('Tenant is not active');
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: dto.email } },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const features = await this.featureFlags.listForTenant(tenant.id);

    return this.buildAuthResponse(
      {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role as unknown as UserRole,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        branchId: user.branchId,
      },
      features,
    );
  }

  async getProfile(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new UnauthorizedException('User not found');
    return {
      id: u.id, email: u.email, fullName: u.fullName, phone: u.phone, role: u.role,
      branchId: u.branchId, isActive: u.isActive, lastLoginAt: u.lastLoginAt,
    };
  }

  async updateProfile(userId: string, dto: { fullName?: string; email?: string; phone?: string }) {
    const data: any = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.email !== undefined)    data.email    = dto.email;
    if (dto.phone !== undefined)    data.phone    = dto.phone;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    const updated = await this.prisma.user.update({ where: { id: userId }, data });
    return {
      id: updated.id, email: updated.email, fullName: updated.fullName,
      phone: updated.phone, role: updated.role,
    };
  }

  async changePassword(userId: string, dto: { currentPassword: string; newPassword: string }) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new UnauthorizedException('User not found');
    const ok = await bcrypt.compare(dto.currentPassword, u.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');
    if (!dto.newPassword || dto.newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { ok: true };
  }

  private buildAuthResponse(
    user: AuthResponse['user'],
    features: AuthResponse['features'],
  ): AuthResponse {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      branchId: user.branchId,
    };
    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret',
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d',
    });
    return { accessToken, refreshToken, user, features };
  }
}
