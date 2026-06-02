import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { CreateSeatAssignmentDto } from './dto/create-seat-assignment.dto';
import { PaginatedResponse, Shift, SeatAssignmentStatus } from '@lms/shared';

const CONFIRMATION_THRESHOLD = 0.5; // 50% of monthlyRate paid → CONFIRMED

const BLOCKING_STATUSES: SeatAssignmentStatus[] = [
  SeatAssignmentStatus.TEMPORARY, SeatAssignmentStatus.CONFIRMED,
];

@Injectable()
export class SeatAssignmentsService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
    private audit: AuditService,
  ) {}

  async list(opts: {
    branchId?: string;
    status?: SeatAssignmentStatus | 'ALL';
    statusIn?: SeatAssignmentStatus[];
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedResponse<any>> {
    const tenantId = this.tenantCtx.tenantId;
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 25, 200);

    const where: any = { tenantId };
    if (opts.statusIn && opts.statusIn.length) {
      where.status = { in: opts.statusIn };
    } else if (opts.status && opts.status !== 'ALL') {
      where.status = opts.status;
    }
    if (opts.branchId) where.seat = { branchId: opts.branchId };
    if (opts.search) {
      const q = opts.search;
      where.OR = [
        { student: { fullName: { contains: q, mode: 'insensitive' } } },
        { student: { code:     { contains: q, mode: 'insensitive' } } },
        { student: { phone:    { contains: q } } },
        { seat:    { code:     { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.seatAssignment.findMany({
        where,
        include: {
          seat:    { select: { id: true, code: true, type: true, branchId: true, zone: true, floor: true } },
          student: { select: { id: true, code: true, fullName: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.seatAssignment.count({ where }),
    ]);

    // Hydrate paidAmount + paidPct for the rows on this page.
    const studentIds = [...new Set(data.map((r) => r.studentId))];
    const paidByStudent = new Map<string, number>();
    if (studentIds.length) {
      const aggs = await this.prisma.payment.groupBy({
        by: ['studentId'],
        where: { tenantId, studentId: { in: studentIds }, status: 'PAID', deletedAt: null },
        _sum: { amount: true },
      });
      for (const a of aggs) {
        paidByStudent.set(a.studentId, Number(a._sum.amount ?? 0));
      }
    }
    const hydrated = data.map((r) => {
      const paid = paidByStudent.get(r.studentId) ?? 0;
      const rate = r.monthlyRate ? Number(r.monthlyRate) : null;
      const pct = rate && rate > 0 ? Math.min(100, Math.round((paid / rate) * 100)) : null;
      return { ...r, paidAmount: paid, paidPct: pct };
    });

    return { data: hydrated, total, page, limit };
  }

  async create(dto: CreateSeatAssignmentDto) {
    const tenantId = this.tenantCtx.tenantId;

    const [seat, student] = await Promise.all([
      this.prisma.seat.findFirst({ where: { id: dto.seatId, tenantId } }),
      this.prisma.student.findFirst({ where: { id: dto.studentId, tenantId } }),
    ]);
    if (!seat) throw new BadRequestException('Seat not found in this tenant');
    if (!student) throw new BadRequestException('Student not found in this tenant');
    if (!seat.isActive) throw new BadRequestException('Seat is inactive');
    if (student.status !== 'ACTIVE') throw new BadRequestException('Student is not active');

    // Reject if student already holds any active allocation
    const existingForStudent = await this.prisma.seatAssignment.findFirst({
      where: { tenantId, studentId: dto.studentId, status: { in: BLOCKING_STATUSES } },
      include: { seat: { select: { code: true } } },
    });
    if (existingForStudent) {
      throw new ConflictException(
        `${student.fullName} is already allocated to seat ${existingForStudent.seat.code} (${existingForStudent.shift}). End that allocation first.`,
      );
    }

    // Seat × shift conflict
    const conflicts = await this.prisma.seatAssignment.findMany({
      where: {
        tenantId,
        seatId: dto.seatId,
        status: { in: BLOCKING_STATUSES },
        OR: this.conflictingShifts(dto.shift).map((shift) => ({ shift })),
      },
      include: { student: { select: { code: true, fullName: true } } },
    });
    if (conflicts.length) {
      const occupant = conflicts[0];
      throw new ConflictException(
        `Seat ${seat.code} is already occupied for shift ${occupant.shift} by ${occupant.student.fullName} (${occupant.student.code})`,
      );
    }

    // Snapshot the rate for this shift; falls back to FULL_DAY if specific shift missing.
    const rates = (seat.monthlyRates as Record<string, number> | null) ?? null;
    const snapshotRate = rates?.[dto.shift] ?? rates?.['FULL_DAY'] ?? null;

    // TEMPORARY by default; CONFIRMED if student has already paid ≥ 50%.
    const status = await this.computeStatusFor(tenantId, dto.studentId, snapshotRate);

    const created = await this.prisma.seatAssignment.create({
      data: {
        tenantId,
        seatId: dto.seatId,
        studentId: dto.studentId,
        shift: dto.shift,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        status,
        monthlyRate: snapshotRate as any,
        nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : null,
      },
      include: {
        seat:    { select: { id: true, code: true, type: true, branchId: true } },
        student: { select: { id: true, code: true, fullName: true, phone: true } },
      },
    });

    await this.audit.record({
      tenantId,
      userId: this.tenantCtx.userId,
      action: 'ALLOCATE_SEAT',
      entity: 'seat_assignments',
      entityId: created.id,
      diff: { after: { seatCode: seat.code, studentCode: student.code, shift: dto.shift, status, snapshotRate } },
    });
    return created;
  }

  async end(id: string) {
    const tenantId = this.tenantCtx.tenantId;
    const existing = await this.prisma.seatAssignment.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Assignment not found');
    if (existing.status === SeatAssignmentStatus.ENDED) {
      throw new BadRequestException('Already ended');
    }
    const ended = await this.prisma.seatAssignment.update({
      where: { id },
      data: {
        status: SeatAssignmentStatus.ENDED,
        endDate: existing.endDate ?? new Date(),
      },
    });
    await this.audit.record({
      tenantId,
      userId: this.tenantCtx.userId,
      action: 'END_SEAT_ALLOCATION',
      entity: 'seat_assignments',
      entityId: ended.id,
    });
    return ended;
  }

  /** Back-compat alias — payment recording calls this. */
  async maybePromoteAfterPayment(tenantId: string, studentId: string) {
    return this.reconcileAfterPaymentChange(tenantId, studentId);
  }

  /**
   * Re-evaluates a student's active allocations against the 50%-paid threshold
   * after ANY payment change (record OR delete). Promotes TEMPORARY→CONFIRMED
   * when paid ≥ 50%, and reverts CONFIRMED→TEMPORARY when a deletion drops it
   * below. Soft-deleted payments are excluded from the paid total.
   */
  async reconcileAfterPaymentChange(tenantId: string, studentId: string) {
    const assigns = await this.prisma.seatAssignment.findMany({
      where: { tenantId, studentId, status: { in: BLOCKING_STATUSES } },
    });
    if (!assigns.length) return;
    const paidAgg = await this.prisma.payment.aggregate({
      where: { tenantId, studentId, status: 'PAID', deletedAt: null },
      _sum: { amount: true },
    });
    const paid = Number(paidAgg._sum.amount ?? 0);
    for (const a of assigns) {
      const rate = a.monthlyRate ? Number(a.monthlyRate) : 0;
      const desired = rate > 0 && paid >= rate * CONFIRMATION_THRESHOLD
        ? SeatAssignmentStatus.CONFIRMED
        : SeatAssignmentStatus.TEMPORARY;
      if (desired !== a.status) {
        await this.prisma.seatAssignment.update({ where: { id: a.id }, data: { status: desired } });
        await this.audit.record({
          tenantId,
          userId: this.tenantCtx.userId,
          action: desired === SeatAssignmentStatus.CONFIRMED ? 'CONFIRM_SEAT_ALLOCATION' : 'REVERT_SEAT_ALLOCATION',
          entity: 'seat_assignments',
          entityId: a.id,
          diff: { paid, monthlyRate: rate, threshold: CONFIRMATION_THRESHOLD },
        });
      }
    }
  }

  private async computeStatusFor(
    tenantId: string, studentId: string, monthlyRate: number | null,
  ): Promise<SeatAssignmentStatus> {
    if (!monthlyRate) return SeatAssignmentStatus.TEMPORARY;
    const paid = await this.prisma.payment.aggregate({
      where: { tenantId, studentId, status: 'PAID', deletedAt: null },
      _sum: { amount: true },
    });
    const total = Number(paid._sum.amount ?? 0);
    return total >= monthlyRate * CONFIRMATION_THRESHOLD
      ? SeatAssignmentStatus.CONFIRMED
      : SeatAssignmentStatus.TEMPORARY;
  }

  private conflictingShifts(requested: Shift): Shift[] {
    if (requested === Shift.FULL_DAY) {
      return [Shift.MORNING, Shift.AFTERNOON, Shift.EVENING, Shift.NIGHT, Shift.FULL_DAY];
    }
    return [requested, Shift.FULL_DAY];
  }
}
