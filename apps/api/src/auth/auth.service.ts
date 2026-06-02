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
    // Tenant/staff login only. SuperAdmin must use the dedicated platform console
    // login (POST /auth/superadmin-login) — they cannot sign in here.
    if (!dto.tenantSlug) {
      throw new BadRequestException(
        'Tenant is required. Platform owners must use the SuperAdmin console login.',
      );
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
        mustChangePassword: user.mustChangePassword,
      },
      features,
    );
  }

  /**
   * Password-only platform-owner login. Matches the secret against any active
   * PlatformAdmin (there's normally one). No email/tenant needed.
   */
  async superAdminLogin(password: string): Promise<AuthResponse> {
    if (!password) throw new UnauthorizedException('Password is required');
    const admins = await this.prisma.platformAdmin.findMany({ where: { isActive: true } });
    for (const admin of admins) {
      if (await bcrypt.compare(password, admin.passwordHash)) {
        return this.buildAuthResponse(
          {
            id: admin.id,
            email: admin.email,
            fullName: admin.fullName,
            role: UserRole.SUPER_ADMIN,
            tenantId: null,
            tenantSlug: null,
            branchId: null,
            mustChangePassword: false,
          },
          [],
        );
      }
    }
    throw new UnauthorizedException('Invalid password');
  }

  /**
   * Student self-service login for the check-in kiosk. Identity = tenant slug +
   * student code + password. Until a student sets a password, their phone number
   * is the default password (so existing students can log in with no provisioning).
   */
  async studentLogin(dto: { tenantSlug?: string; code?: string; password?: string }): Promise<AuthResponse> {
    if (!dto.tenantSlug || !dto.code || !dto.password) {
      throw new BadRequestException('Tenant, student code and password are required');
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } });
    if (!tenant) throw new UnauthorizedException('Invalid tenant or credentials');
    if (tenant.status !== 'ACTIVE' && tenant.status !== 'TRIAL') {
      throw new UnauthorizedException('Tenant is not active');
    }
    const student = await this.prisma.student.findFirst({
      where: { tenantId: tenant.id, code: dto.code.trim() },
    });
    if (!student || student.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid student code or password (account must be active)');
    }
    const ok = student.passwordHash
      ? await bcrypt.compare(dto.password, student.passwordHash)
      : dto.password.trim() === student.phone; // default password = phone until one is set
    if (!ok) throw new UnauthorizedException('Invalid student code or password');

    return this.buildAuthResponse(
      {
        id: student.id,
        email: student.code,
        fullName: student.fullName,
        role: UserRole.STUDENT,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        branchId: student.branchId,
        mustChangePassword: student.mustChangePassword,
      },
      [],
    );
  }

  /** A student changing their own kiosk password. Current = stored hash, or phone if unset. */
  async studentChangePassword(studentId: string, dto: { currentPassword: string; newPassword: string }) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new UnauthorizedException('Student not found');
    const ok = student.passwordHash
      ? await bcrypt.compare(dto.currentPassword, student.passwordHash)
      : dto.currentPassword?.trim() === student.phone;
    if (!ok) throw new BadRequestException('Current password is incorrect');
    if (!dto.newPassword || dto.newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.student.update({
      where: { id: studentId },
      data: { passwordHash, mustChangePassword: false },
    });
    return { ok: true };
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
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
    });
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
