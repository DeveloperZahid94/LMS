import { BadRequestException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CheckInDto, ManualAttendanceDto } from './dto/check-in.dto';
import { AttendanceSource } from '@lms/shared';

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
  ) {}

  async checkInByQr(dto: CheckInDto) {
    const tenantId = this.tenantCtx.tenantId;
    const student = await this.prisma.student.findFirst({
      where: { tenantId, qrCode: dto.qrCode, status: 'ACTIVE' },
    });
    if (!student) throw new NotFoundException('Invalid QR — student not found');
    return this.upsertTodayAttendance(
      tenantId, dto.branchId, student.id, dto.source ?? AttendanceSource.QR,
    );
  }

  manualCheckIn(dto: ManualAttendanceDto) {
    const tenantId = this.tenantCtx.tenantId;
    return this.upsertTodayAttendance(tenantId, dto.branchId, dto.studentId, AttendanceSource.MANUAL);
  }

  async checkOut(attendanceId: string) {
    const tenantId = this.tenantCtx.tenantId;
    const attendance = await this.prisma.attendance.findFirst({
      where: { id: attendanceId, tenantId },
    });
    if (!attendance) throw new NotFoundException('Attendance not found');
    if (attendance.checkOutAt) throw new ConflictException('Already checked out');
    return this.prisma.attendance.update({
      where: { id: attendanceId },
      data: { checkOutAt: new Date() },
    });
  }

  listForDate(date: string, branchId?: string) {
    const tenantId = this.tenantCtx.tenantId;
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    return this.prisma.attendance.findMany({
      where: { tenantId, date: dayStart, ...(branchId && { branchId }) },
      include: { student: { select: { id: true, code: true, fullName: true, phone: true } } },
      orderBy: { checkInAt: 'desc' },
    });
  }

  /** Admin reset: delete a day's attendance record so the student can check in fresh. */
  async remove(id: string) {
    const tenantId = this.tenantCtx.tenantId;
    const existing = await this.prisma.attendance.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Attendance record not found');
    await this.prisma.attendance.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  // ---------------- Student self check-in/out ----------------
  async selfToday(studentId: string) {
    const tenantId = this.tenantCtx.tenantId;
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true, code: true, fullName: true, photoUrl: true, branchId: true, expiresAt: true, outstandingBalance: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    const dayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const attendance = await this.prisma.attendance.findUnique({
      where: { studentId_date: { studentId, date: dayStart } },
    });

    // Allocation details (cabin + PG) and earliest upcoming due date, for the kiosk banner + allotment card.
    const [seats, pgs] = await Promise.all([
      this.prisma.seatAssignment.findMany({
        where: { tenantId, studentId, status: { in: ['TEMPORARY', 'CONFIRMED'] } },
        include: { seat: { select: { code: true } } },
      }),
      this.prisma.pgRoomAssignment.findMany({
        where: { tenantId, studentId, status: 'ACTIVE' },
        include: { room: { select: { roomNumber: true } } },
      }),
    ]);
    const allocations = [
      ...seats.map((a) => ({
        type: 'SEAT' as const,
        label: `Seat ${a.seat.code} · ${a.shift}`,
        monthlyRate: a.monthlyRate ? Number(a.monthlyRate) : 0,
        nextDueDate: a.nextDueDate,
        status: a.status as string, // CONFIRMED | TEMPORARY
      })),
      ...pgs.map((a) => ({
        type: 'PG' as const,
        label: `PG ${a.room.roomNumber} · Bed ${a.bedNumber}`,
        monthlyRate: a.monthlyRate ? Number(a.monthlyRate) : 0,
        nextDueDate: a.nextDueDate,
        status: a.status as string, // ACTIVE
      })),
    ];
    const dueTimes = allocations
      .map((a) => a.nextDueDate)
      .filter((d): d is Date => !!d)
      .map((d) => new Date(d).getTime());
    const nextDueDate = dueTimes.length ? new Date(Math.min(...dueTimes)).toISOString() : null;

    // Payments + status summary for the kiosk.
    const paid = await this.prisma.payment.findMany({
      where: { tenantId, studentId, status: 'PAID', deletedAt: null },
      select: { amount: true },
    });
    const totalPaid = paid.reduce((s, p) => s + Number(p.amount), 0);
    const monthlyTotal = allocations.reduce((s, a) => s + a.monthlyRate, 0);
    // An allocation is "confirmed" when a seat is CONFIRMED or a PG bed is ACTIVE.
    const confirmed = allocations.some((a) => a.status === 'CONFIRMED' || a.status === 'ACTIVE');
    // Authoritative signed balance (expected − paid − discount), maintained by
    // BalanceService. > 0 = due, < 0 = advance/credit, 0 = settled — so advance
    // payments are reflected correctly instead of a naive "fee if due passed".
    const balance = Number(student.outstandingBalance ?? 0);

    return {
      student, attendance, allocations, nextDueDate, expiresAt: student.expiresAt,
      totalPaid, monthlyTotal, balance, confirmed,
    };
  }

  async selfCheckIn(studentId: string, dto: { lat?: number; lng?: number; selfie?: string }) {
    const tenantId = this.tenantCtx.tenantId;
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true, branchId: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (!student.branchId) throw new BadRequestException('No branch assigned to this student');
    const now = new Date();
    const dayStart = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const existing = await this.prisma.attendance.findUnique({
      where: { studentId_date: { studentId, date: dayStart } },
    });
    if (existing) throw new ConflictException('You already checked in today');
    return this.prisma.attendance.create({
      data: {
        tenantId, branchId: student.branchId, studentId, date: dayStart,
        checkInAt: now, source: 'SELF' as any,
        checkInLat: dto.lat ?? null, checkInLng: dto.lng ?? null, checkInSelfieUrl: dto.selfie ?? null,
      },
    });
  }

  async selfCheckOut(studentId: string, dto: { lat?: number; lng?: number; selfie?: string }) {
    const tenantId = this.tenantCtx.tenantId;
    const dayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const existing = await this.prisma.attendance.findUnique({
      where: { studentId_date: { studentId, date: dayStart } },
    });
    if (!existing || existing.tenantId !== tenantId) throw new NotFoundException('No check-in found for today');
    if (existing.checkOutAt) throw new ConflictException('You already checked out today');
    return this.prisma.attendance.update({
      where: { id: existing.id },
      data: {
        checkOutAt: new Date(),
        checkOutLat: dto.lat ?? null, checkOutLng: dto.lng ?? null, checkOutSelfieUrl: dto.selfie ?? null,
      },
    });
  }

  /** Attendance report across a date range with optional branch/student filters. */
  report(opts: { from?: string; to?: string; branchId?: string; studentId?: string; source?: string } = {}) {
    const tenantId = this.tenantCtx.tenantId;
    const where: any = { tenantId };
    if (opts.branchId) where.branchId = opts.branchId;
    if (opts.studentId) where.studentId = opts.studentId;
    if (opts.source) where.source = opts.source;
    if (opts.from || opts.to) {
      where.date = {};
      if (opts.from) where.date.gte = new Date(`${opts.from}T00:00:00.000Z`);
      if (opts.to) where.date.lte = new Date(`${opts.to}T00:00:00.000Z`);
    }
    return this.prisma.attendance.findMany({
      where,
      include: {
        student: { select: { id: true, code: true, fullName: true, phone: true } },
        branch: { select: { name: true } },
      },
      orderBy: [{ date: 'desc' }, { checkInAt: 'desc' }],
      take: 5000,
    });
  }

  /** Recent attendance records for one student (newest first) — used on the profile page. */
  listForStudent(studentId: string, limit = 60) {
    const tenantId = this.tenantCtx.tenantId;
    return this.prisma.attendance.findMany({
      where: { tenantId, studentId },
      orderBy: { date: 'desc' },
      take: Math.min(limit, 200),
      select: { id: true, date: true, checkInAt: true, checkOutAt: true, source: true },
    });
  }

  private async upsertTodayAttendance(
    tenantId: string, branchId: string, studentId: string, source: AttendanceSource,
  ) {
    const now = new Date();
    const dayStart = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');

    const existing = await this.prisma.attendance.findUnique({
      where: { studentId_date: { studentId, date: dayStart } },
    });
    if (existing) {
      throw new ConflictException('Student already checked in today');
    }
    return this.prisma.attendance.create({
      data: {
        tenantId,
        branchId,
        studentId,
        date: dayStart,
        checkInAt: now,
        source,
      },
    });
  }
}
