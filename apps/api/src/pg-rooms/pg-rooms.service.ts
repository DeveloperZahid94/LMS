import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { BalanceService } from '../balance/balance.service';
import {
  AssignBedDto, CreatePgRoomDto, PgRoomType, PgRoomsListQueryDto, UpdatePgRoomDto, defaultBedCount,
} from './dto/pg-room.dto';

@Injectable()
export class PgRoomsService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
    private audit: AuditService,
    private balance: BalanceService,
  ) {}

  // TODO(prisma-client): once `npx prisma generate` is re-run with the new
  // PgRoom models from schema.prisma, the `as any` indirection below can go
  // away and the methods can use `this.prisma.pgRoom` directly with full types.
  private get db(): any { return this.prisma as any; }

  async list(q: PgRoomsListQueryDto) {
    const tenantId = this.tenantCtx.tenantId;
    const where: any = { tenantId, isActive: true };
    if (q.branchId) where.branchId = q.branchId;
    if (q.type) where.type = q.type;
    if (q.search) {
      const s = q.search.trim();
      where.OR = [
        { roomNumber: { contains: s, mode: 'insensitive' } },
        { notes: { contains: s, mode: 'insensitive' } },
      ];
    }

    const rooms = await this.db.pgRoom.findMany({
      where,
      orderBy: { roomNumber: 'asc' },
      include: {
        assignments: {
          where: { status: 'ACTIVE' },
          include: {
            student: { select: { id: true, code: true, fullName: true, phone: true, email: true } },
          },
        },
      },
    });

    // Per-room history counts in one extra query, keyed by roomId.
    const historyAgg = await this.db.pgRoomAssignment.groupBy({
      by: ['roomId'],
      where: { tenantId, roomId: { in: rooms.map((r: any) => r.id) } },
      _count: { _all: true },
    });
    const historyByRoom = new Map<string, number>(
      historyAgg.map((g: any) => [g.roomId, g._count._all as number]),
    );

    const shaped = rooms.map((r: any) => this.shapeRoom(r, historyByRoom.get(r.id) ?? 0));
    // Optional client-side availability filter.
    if (q.availability && q.availability !== 'ALL') {
      return shaped.filter((r: any) => {
        if (q.availability === 'AVAILABLE') return r.occupiedBeds === 0;
        if (q.availability === 'FULL')      return r.occupiedBeds === r.bedCount;
        return r.occupiedBeds > 0 && r.occupiedBeds < r.bedCount;
      });
    }
    return shaped;
  }

  async stats(branchId?: string) {
    const tenantId = this.tenantCtx.tenantId;
    const where: any = { tenantId, isActive: true };
    if (branchId) where.branchId = branchId;

    const rooms = await this.db.pgRoom.findMany({
      where,
      include: {
        assignments: { where: { status: 'ACTIVE' }, select: { id: true } },
      },
    });

    let totalBeds = 0, occupiedBeds = 0;
    const byType: Record<string, number> = { SINGLE: 0, DOUBLE: 0, TRIPLE: 0 };
    for (const r of rooms) {
      totalBeds += r.bedCount;
      occupiedBeds += r.assignments.length;
      byType[r.type] = (byType[r.type] ?? 0) + 1;
    }
    return {
      totalRooms: rooms.length,
      totalBeds,
      occupiedBeds,
      availableBeds: Math.max(0, totalBeds - occupiedBeds),
      singleRooms: byType.SINGLE,
      doubleRooms: byType.DOUBLE,
      tripleRooms: byType.TRIPLE,
    };
  }

  async create(dto: CreatePgRoomDto) {
    const tenantId = this.tenantCtx.tenantId;
    const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, tenantId } });
    if (!branch) throw new BadRequestException('Branch not found in this tenant');

    const bedCount = dto.bedCount ?? defaultBedCount(dto.type);
    const room = await this.db.pgRoom.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        roomNumber: dto.roomNumber,
        type: dto.type,
        bedCount,
        monthlyRate: dto.monthlyRate,
        floor: dto.floor ?? null,
        notes: dto.notes ?? null,
        amenities: dto.amenities ?? [],
      },
    });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'CREATE_PG_ROOM', entity: 'pg_rooms', entityId: room.id, diff: { after: room },
    });
    return this.shapeRoom({ ...room, assignments: [] }, 0);
  }

  async update(id: string, dto: UpdatePgRoomDto) {
    const tenantId = this.tenantCtx.tenantId;
    const existing = await this.db.pgRoom.findFirst({
      where: { id, tenantId },
      include: { assignments: { where: { status: 'ACTIVE' } } },
    });
    if (!existing) throw new NotFoundException('Room not found');

    // Refuse to shrink bedCount below the number of currently-assigned beds.
    if (dto.bedCount !== undefined && dto.bedCount < existing.assignments.length) {
      throw new BadRequestException(
        `Cannot reduce bedCount to ${dto.bedCount}; ${existing.assignments.length} bed(s) are currently assigned.`,
      );
    }

    const updated = await this.db.pgRoom.update({
      where: { id },
      data: {
        ...(dto.roomNumber !== undefined && { roomNumber: dto.roomNumber }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.bedCount !== undefined && { bedCount: dto.bedCount }),
        ...(dto.monthlyRate !== undefined && { monthlyRate: dto.monthlyRate }),
        ...(dto.floor !== undefined && { floor: dto.floor }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.amenities !== undefined && { amenities: dto.amenities }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        assignments: {
          where: { status: 'ACTIVE' },
          include: {
            student: { select: { id: true, code: true, fullName: true, phone: true, email: true } },
          },
        },
      },
    });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'UPDATE_PG_ROOM', entity: 'pg_rooms', entityId: id, diff: { before: existing, after: updated },
    });
    const historyCount = await this.db.pgRoomAssignment.count({ where: { tenantId, roomId: id } });
    return this.shapeRoom(updated, historyCount);
  }

  async remove(id: string) {
    const tenantId = this.tenantCtx.tenantId;
    const room = await this.db.pgRoom.findFirst({
      where: { id, tenantId },
      include: { assignments: { where: { status: 'ACTIVE' } } },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room.assignments.length > 0) {
      throw new BadRequestException(
        `Cannot delete room ${room.roomNumber}: ${room.assignments.length} bed(s) still assigned. Unassign them first.`,
      );
    }
    // Soft-delete (isActive = false) so historic assignments stay readable.
    await this.db.pgRoom.update({ where: { id }, data: { isActive: false } });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'DELETE_PG_ROOM', entity: 'pg_rooms', entityId: id, diff: { before: room },
    });
    return { id, deleted: true };
  }

  async assign(roomId: string, dto: AssignBedDto) {
    const tenantId = this.tenantCtx.tenantId;
    const room = await this.db.pgRoom.findFirst({
      where: { id: roomId, tenantId },
      include: { assignments: { where: { status: 'ACTIVE' } } },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room.isActive === false) throw new BadRequestException('Room is inactive');

    if (dto.bedNumber < 1 || dto.bedNumber > room.bedCount) {
      throw new BadRequestException(`bedNumber must be between 1 and ${room.bedCount}`);
    }
    const occupiedBed = room.assignments.find((a: any) => a.bedNumber === dto.bedNumber);
    if (occupiedBed) throw new BadRequestException(`Bed ${dto.bedNumber} is already assigned`);

    const student = await this.prisma.student.findFirst({ where: { id: dto.studentId, tenantId } });
    if (!student) throw new BadRequestException('Student not found in this tenant');

    // A student can hold at most one active PG bed at a time.
    const existing = await this.db.pgRoomAssignment.findFirst({
      where: { tenantId, studentId: dto.studentId, status: 'ACTIVE' },
    });
    if (existing) {
      throw new BadRequestException('Student already has an active PG room assignment');
    }

    const created = await this.db.pgRoomAssignment.create({
      data: {
        tenantId,
        roomId,
        studentId: dto.studentId,
        bedNumber: dto.bedNumber,
        startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
        monthlyRate: dto.monthlyRate ?? room.monthlyRate,
        nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : null,
        notes: dto.notes ?? null,
        status: 'ACTIVE',
      },
      include: {
        student: { select: { id: true, code: true, fullName: true, phone: true, email: true } },
      },
    });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'PG_BED_ASSIGN', entity: 'pg_room_assignments', entityId: created.id, diff: { after: created },
    });
    await this.balance.recompute(tenantId, dto.studentId);
    return created;
  }

  async unassign(assignmentId: string) {
    const tenantId = this.tenantCtx.tenantId;
    const a = await this.db.pgRoomAssignment.findFirst({
      where: { id: assignmentId, tenantId },
    });
    if (!a) throw new NotFoundException('Assignment not found');
    if (a.status !== 'ACTIVE') throw new BadRequestException('Assignment already ended');
    const updated = await this.db.pgRoomAssignment.update({
      where: { id: assignmentId },
      data: { status: 'ENDED', endDate: new Date() },
    });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'PG_BED_UNASSIGN', entity: 'pg_room_assignments', entityId: assignmentId, diff: { before: a, after: updated },
    });
    await this.balance.recompute(tenantId, a.studentId);
    return updated;
  }

  async history(roomId: string) {
    const tenantId = this.tenantCtx.tenantId;
    const rows = await this.db.pgRoomAssignment.findMany({
      where: { tenantId, roomId },
      orderBy: { createdAt: 'desc' },
      include: {
        student: { select: { id: true, code: true, fullName: true, phone: true } },
      },
    });
    return rows;
  }

  /**
   * Folds a raw room row (with its ACTIVE assignments included) into a UI-friendly
   * shape: one entry per physical bed, each carrying the active assignment if any.
   */
  private shapeRoom(r: any, historyCount: number) {
    const beds: any[] = [];
    const byBed = new Map<number, any>();
    for (const a of r.assignments ?? []) byBed.set(a.bedNumber, a);
    for (let n = 1; n <= r.bedCount; n++) {
      const a = byBed.get(n);
      beds.push({
        bedNumber: n,
        status: a ? 'OCCUPIED' : 'AVAILABLE',
        assignment: a
          ? {
              id: a.id,
              startDate: a.startDate,
              nextDueDate: a.nextDueDate,
              monthlyRate: a.monthlyRate != null ? Number(a.monthlyRate) : null,
              student: a.student,
            }
          : null,
      });
    }
    const occupiedBeds = beds.filter((b) => b.status === 'OCCUPIED').length;
    return {
      id: r.id,
      tenantId: r.tenantId,
      branchId: r.branchId,
      roomNumber: r.roomNumber,
      type: r.type,
      bedCount: r.bedCount,
      monthlyRate: r.monthlyRate != null ? Number(r.monthlyRate) : 0,
      floor: r.floor,
      amenities: r.amenities ?? [],
      notes: r.notes,
      isActive: r.isActive,
      beds,
      occupiedBeds,
      availableBeds: r.bedCount - occupiedBeds,
      historyCount,
    };
  }
}
