import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateSeatDto } from './dto/create-seat.dto';

@Injectable()
export class SeatsService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
  ) {}

  list(branchId?: string) {
    const tenantId = this.tenantCtx.tenantId;
    return this.prisma.seat.findMany({
      where: { tenantId, ...(branchId && { branchId }) },
      orderBy: [{ branchId: 'asc' }, { code: 'asc' }],
      include: {
        assignments: {
          where: { status: { in: ['TEMPORARY', 'CONFIRMED'] } },
          select: {
            id: true, shift: true, studentId: true, status: true, nextDueDate: true,
            student: { select: { id: true, code: true, fullName: true } },
          },
        },
      },
    });
  }

  async create(dto: CreateSeatDto) {
    const tenantId = this.tenantCtx.tenantId;
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId },
    });
    if (!branch) throw new BadRequestException('Branch not found in this tenant');
    return this.prisma.seat.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        code: dto.code,
        type: dto.type,
        floor: dto.floor ?? null,
        zone: dto.zone ?? null,
        amenities: dto.amenities ?? [],
        monthlyRates: (dto.monthlyRates as any) ?? null,
        notes: dto.notes ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: Partial<CreateSeatDto>) {
    const tenantId = this.tenantCtx.tenantId;
    const seat = await this.prisma.seat.findFirst({ where: { id, tenantId } });
    if (!seat) throw new NotFoundException('Seat not found');
    return this.prisma.seat.update({
      where: { id },
      data: {
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.floor !== undefined && { floor: dto.floor }),
        ...(dto.zone !== undefined && { zone: dto.zone }),
        ...(dto.amenities !== undefined && { amenities: dto.amenities }),
        ...(dto.monthlyRates !== undefined && { monthlyRates: dto.monthlyRates as any }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string) {
    const tenantId = this.tenantCtx.tenantId;
    const seat = await this.prisma.seat.findFirst({ where: { id, tenantId } });
    if (!seat) throw new NotFoundException('Seat not found');
    await this.prisma.seat.delete({ where: { id } });
    return { id, deleted: true };
  }
}
