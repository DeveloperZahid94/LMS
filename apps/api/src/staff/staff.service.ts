import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@lms/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { ASSIGNABLE_STAFF_ROLES, CreateStaffDto, UpdateStaffDto } from './dto/staff.dto';

/** Roles that represent tenant staff (everyone except students). */
const STAFF_ROLES: UserRole[] = [UserRole.CLIENT_ADMIN, UserRole.BRANCH_ADMIN, UserRole.STAFF];

@Injectable()
export class StaffService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
    private audit: AuditService,
  ) {}

  /**
   * Staff users in the tenant. Used both by the management screen and to
   * populate the "staff" / "assigned by" dropdowns in expenses & assignments.
   * Pass `activeOnly` to limit to selectable (active) members.
   */
  async list(activeOnly = false) {
    const tenantId = this.tenantCtx.tenantId;
    const rows = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: STAFF_ROLES as any },
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
    return rows.map((r) => this.shape(r));
  }

  async create(dto: CreateStaffDto) {
    const tenantId = this.tenantCtx.tenantId;
    this.assertAssignableRole(dto.role);

    const email = dto.email.trim().toLowerCase();
    const clash = await this.prisma.user.findFirst({ where: { tenantId, email } });
    if (clash) throw new ConflictException('A user with this email already exists.');

    if (dto.branchId) await this.assertBranch(tenantId, dto.branchId);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.user.create({
      data: {
        tenantId,
        branchId: dto.branchId ?? null,
        email,
        passwordHash,
        fullName: dto.fullName.trim(),
        phone: dto.phone?.trim() || null,
        role: dto.role as any,
        // New staff set their own password on first login.
        mustChangePassword: true,
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'STAFF_CREATE', entity: 'users', entityId: created.id,
      diff: { after: { email, fullName: created.fullName, role: created.role } },
    });
    return this.shape(created);
  }

  async update(id: string, dto: UpdateStaffDto) {
    const tenantId = this.tenantCtx.tenantId;
    const existing = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Staff member not found');
    // Guard the tenant owner — its role/active state isn't editable from here.
    if ((existing.role as string) === UserRole.CLIENT_ADMIN) {
      throw new BadRequestException('The tenant owner account cannot be edited from the staff screen.');
    }
    if (dto.role) this.assertAssignableRole(dto.role);
    if (dto.branchId) await this.assertBranch(tenantId, dto.branchId);

    const data: any = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.role !== undefined) data.role = dto.role as any;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.branchId !== undefined) data.branchId = dto.branchId || null;
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      data.mustChangePassword = true;
      data.passwordChangedAt = new Date();
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'STAFF_UPDATE', entity: 'users', entityId: id,
      diff: { before: { role: existing.role, isActive: existing.isActive }, after: { role: updated.role, isActive: updated.isActive } },
    });
    return this.shape(updated);
  }

  private assertAssignableRole(role: UserRole) {
    if (!ASSIGNABLE_STAFF_ROLES.includes(role as any)) {
      throw new BadRequestException(`Role must be one of: ${ASSIGNABLE_STAFF_ROLES.join(', ')}`);
    }
  }

  private async assertBranch(tenantId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId } });
    if (!branch) throw new BadRequestException('Branch not found in this tenant');
  }

  private shape(r: any) {
    return {
      id: r.id,
      fullName: r.fullName,
      email: r.email,
      phone: r.phone ?? null,
      role: r.role,
      isActive: r.isActive,
      branchId: r.branchId ?? null,
      branch: r.branch ?? null,
      lastLoginAt: r.lastLoginAt ?? null,
      createdAt: r.createdAt,
    };
  }
}
