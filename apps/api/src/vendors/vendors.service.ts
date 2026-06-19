import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { CreateVendorDto, RecordVendorAdvanceDto, UpdateVendorDto } from './dto/vendors.dto';

@Injectable()
export class VendorsService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
    private audit: AuditService,
  ) {}

  private shape(v: any) {
    return { ...v, advanceBalance: v.advanceBalance != null ? Number(v.advanceBalance) : 0 };
  }

  /** All vendors for the tenant. Pass activeOnly to drop inactive ones (expense dropdown). */
  async list(activeOnly = false) {
    const tenantId = this.tenantCtx.tenantId;
    const rows = await this.prisma.vendor.findMany({
      where: { tenantId, ...(activeOnly && { isActive: true }) },
      orderBy: { name: 'asc' },
    });
    return rows.map((v) => this.shape(v));
  }

  /** Top up a vendor's advance wallet. The balance is drawn down by future expenses. */
  async recordAdvance(id: string, dto: RecordVendorAdvanceDto) {
    const tenantId = this.tenantCtx.tenantId;
    const existing = await this.prisma.vendor.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Vendor not found');
    const updated = await this.prisma.vendor.update({
      where: { id },
      data: { advanceBalance: { increment: dto.amount } },
    });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'VENDOR_ADVANCE', entity: 'vendors', entityId: id,
      diff: { amount: dto.amount, notes: dto.notes ?? null, before: Number(existing.advanceBalance), after: Number(updated.advanceBalance) },
    });
    return this.shape(updated);
  }

  async create(dto: CreateVendorDto) {
    const tenantId = this.tenantCtx.tenantId;
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Vendor name is required');
    try {
      const created = await this.prisma.vendor.create({
        data: {
          tenantId,
          name,
          contactPerson: dto.contactPerson?.trim() || null,
          phone: dto.phone?.trim() || null,
          email: dto.email?.trim() || null,
          gstNumber: dto.gstNumber?.trim() || null,
          address: dto.address?.trim() || null,
          notes: dto.notes?.trim() || null,
          isActive: dto.isActive ?? true,
        },
      });
      return this.shape(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`A vendor named "${name}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateVendorDto) {
    const tenantId = this.tenantCtx.tenantId;
    const existing = await this.prisma.vendor.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Vendor not found');

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.contactPerson !== undefined) data.contactPerson = dto.contactPerson?.trim() || null;
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.email !== undefined) data.email = dto.email?.trim() || null;
    if (dto.gstNumber !== undefined) data.gstNumber = dto.gstNumber?.trim() || null;
    if (dto.address !== undefined) data.address = dto.address?.trim() || null;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      const updated = await this.prisma.vendor.update({ where: { id }, data });
      return this.shape(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`A vendor named "${data.name}" already exists`);
      }
      throw err;
    }
  }

  async remove(id: string) {
    const tenantId = this.tenantCtx.tenantId;
    const existing = await this.prisma.vendor.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Vendor not found');
    await this.prisma.vendor.delete({ where: { id } });
    return { id, deleted: true };
  }
}
