import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ReactivateStudentDto } from './dto/reactivate-student.dto';
import { ListStudentsDto } from './dto/list-students.dto';
import { SettleBalanceDto } from './dto/settle-balance.dto';
import { BalanceService } from '../balance/balance.service';
import { PaginatedResponse, PaymentMethod, PaymentStatus } from '@lms/shared';

/** Maps a Prisma "unique constraint" violation to a friendly field name. */
function describeUniqueTarget(target: unknown): string | null {
  if (!target) return null;
  const fields = Array.isArray(target) ? target : [String(target)];
  if (fields.some((f) => /phone/i.test(f)))  return 'A student with this phone number already exists in this branch.';
  if (fields.some((f) => /code/i.test(f)))   return 'A student with this code already exists.';
  if (fields.some((f) => /aadhaar/i.test(f))) return 'A student with this Aadhaar number already exists.';
  if (fields.some((f) => /email/i.test(f))) return 'A student with this email already exists.';
  return `Duplicate value on ${fields.join(', ')}.`;
}

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
    private audit: AuditService,
    private balance: BalanceService,
  ) {}

  async list(query: ListStudentsDto): Promise<PaginatedResponse<any>> {
    const tenantId = this.tenantCtx.tenantId;
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: any = { tenantId };
    if (query.branchId) where.branchId = query.branchId;
    // Left (soft-deleted) students are hidden from normal lists unless explicitly requested.
    if (query.status) where.status = query.status;
    else where.status = { not: 'LEFT' };
    if (query.notAllocated) {
      // Exclude students who hold any TEMPORARY or CONFIRMED seat allocation.
      where.seatAssignments = { none: { status: { in: ['TEMPORARY', 'CONFIRMED'] } } };
    }
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { code: { contains: query.search, mode: 'insensitive' } },
        { aadhaarNumber: { contains: query.search } },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      where.joinedAt = {};
      if (query.dateFrom) where.joinedAt.gte = new Date(query.dateFrom);
      if (query.dateTo) {
        // Inclusive end-of-day so a date range like 1–30 Jun includes 30 Jun's records.
        const to = new Date(query.dateTo);
        to.setHours(23, 59, 59, 999);
        where.joinedAt.lte = to;
      }
    }

    const [rows, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          seatAssignments: {
            where: { status: { in: ['TEMPORARY', 'CONFIRMED'] } },
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: { seat: { select: { id: true, code: true, type: true } } },
          },
        },
      }),
      this.prisma.student.count({ where }),
    ]);
    const data = rows.map((s) => {
      const a = s.seatAssignments[0];
      const { seatAssignments, ...rest } = s;
      return {
        ...rest,
        outstandingBalance: Number((rest as any).outstandingBalance ?? 0),
        activeSeat: a
          ? {
              id: a.id,
              seatCode: a.seat.code,
              seatType: a.seat.type,
              shift: a.shift,
              monthlyRate: a.monthlyRate != null ? Number(a.monthlyRate) : null,
              nextDueDate: a.nextDueDate ? a.nextDueDate.toISOString() : null,
              status: a.status,
            }
          : null,
      };
    });
    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const tenantId = this.tenantCtx.tenantId;
    const student = await this.prisma.student.findFirst({ where: { id, tenantId } });
    if (!student) throw new NotFoundException('Student not found');
    return { ...student, outstandingBalance: Number((student as any).outstandingBalance ?? 0) };
  }

  async create(dto: CreateStudentDto) {
    const tenantId = this.tenantCtx.tenantId;

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId },
    });
    if (!branch) throw new BadRequestException('Branch not found in this tenant');

    const code = await this.nextStudentCode(tenantId);
    let created;
    try {
      created = await this.prisma.student.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          code,
          fullName: dto.fullName,
          email: dto.email ?? null,
          phone: dto.phone,
          gender: dto.gender ?? null,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          aadhaarNumber: dto.aadhaarNumber ?? null,
          voterId: dto.voterId ?? null,
          fatherName: dto.fatherName ?? null,
          motherName: dto.motherName ?? null,
          emergencyContact: dto.emergencyContact ?? null,
          permanentAddress: dto.permanentAddress ?? null,
          temporaryAddress: dto.temporaryAddress ?? null,
          examTarget: dto.examTarget ?? null,
          photoUrl: dto.photoUrl ?? null,
          idProofUrl: dto.idProofUrl ?? null,
          aadhaarFrontUrl: dto.aadhaarFrontUrl ?? null,
          aadhaarBackUrl: dto.aadhaarBackUrl ?? null,
          voterIdUrl: dto.voterIdUrl ?? null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          status: dto.status ?? undefined,
          outstandingBalance: dto.outstandingBalance ?? 0,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const msg = describeUniqueTarget((err.meta as any)?.target) ?? 'Duplicate record';
        throw new ConflictException(msg);
      }
      throw err;
    }

    await this.audit.record({
      tenantId,
      userId: this.tenantCtx.userId,
      action: 'CREATE_STUDENT',
      entity: 'students',
      entityId: created.id,
      diff: { after: created },
    });
    return created;
  }

  async update(id: string, dto: UpdateStudentDto) {
    const existing = await this.findOne(id);
    const data: any = {};
    const fields: (keyof UpdateStudentDto)[] = [
      'branchId', 'fullName', 'email', 'phone', 'gender',
      'aadhaarNumber', 'voterId', 'fatherName', 'motherName', 'emergencyContact',
      'permanentAddress', 'temporaryAddress', 'examTarget',
      'photoUrl', 'idProofUrl', 'aadhaarFrontUrl', 'aadhaarBackUrl', 'voterIdUrl', 'status',
    ];
    for (const f of fields) {
      if (dto[f] !== undefined) data[f] = dto[f];
    }
    if (dto.dateOfBirth !== undefined) {
      data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }
    if (dto.expiresAt !== undefined) {
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }

    let updated;
    try {
      updated = await this.prisma.student.update({
        where: { id: existing.id },
        data,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const msg = describeUniqueTarget((err.meta as any)?.target) ?? 'Duplicate record';
        throw new ConflictException(msg);
      }
      throw err;
    }

    await this.audit.record({
      tenantId: existing.tenantId,
      userId: this.tenantCtx.userId,
      action: 'UPDATE_STUDENT',
      entity: 'students',
      entityId: existing.id,
      diff: { before: existing, after: updated },
    });
    return updated;
  }

  /**
   * Soft delete: the student "left". We keep the record + full history (so they can be
   * reactivated later) but mark them LEFT, stamp leftAt, and END every active
   * accommodation so their seat/bed/tiffin frees up immediately. The stored
   * outstandingBalance is intentionally left frozen at its leaving value so it can be
   * surfaced (carry-forward / clear) on reactivation — hence no recompute here.
   */
  async remove(id: string) {
    const existing = await this.findOne(id);
    const tenantId = existing.tenantId;
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.seatAssignment.updateMany({
        where: { tenantId, studentId: id, status: { in: ['TEMPORARY', 'CONFIRMED'] } },
        data: { status: 'ENDED', endDate: now },
      }),
      (this.prisma as any).pgRoomAssignment.updateMany({
        where: { tenantId, studentId: id, status: 'ACTIVE' },
        data: { status: 'ENDED', endDate: now },
      }),
      (this.prisma as any).tiffinSubscription.updateMany({
        where: { tenantId, studentId: id, status: { in: ['ACTIVE', 'PAUSED'] } },
        data: { status: 'ENDED', endDate: now },
      }),
      this.prisma.student.update({
        where: { id },
        data: { status: 'LEFT' as any, leftAt: now },
      }),
    ]);

    await this.audit.record({
      tenantId,
      userId: this.tenantCtx.userId,
      action: 'DELETE_STUDENT',
      entity: 'students',
      entityId: existing.id,
      diff: { before: existing, after: { status: 'LEFT', leftAt: now } },
    });
    return { id: existing.id, deleted: true, status: 'LEFT' };
  }

  /**
   * Find previously-left students matching a name/email/phone fragment, for the
   * "returning student?" lookup on the registration form. Only LEFT students.
   */
  async findReactivatable(search: string) {
    const tenantId = this.tenantCtx.tenantId;
    const term = (search ?? '').trim();
    if (term.length < 2) return [];
    const rows = await this.prisma.student.findMany({
      where: {
        tenantId,
        status: 'LEFT' as any,
        OR: [
          { fullName: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term } },
          { email: { contains: term, mode: 'insensitive' } },
          { code: { contains: term, mode: 'insensitive' } },
        ],
      },
      orderBy: { leftAt: 'desc' },
      take: 10,
    });
    return rows.map((s) => ({ ...s, outstandingBalance: Number((s as any).outstandingBalance ?? 0) }));
  }

  /**
   * Reactivate a left student: flip status back to ACTIVE, clear leftAt, optionally
   * update changed personal details, and settle the old balance per balanceAction
   * (CARRY keeps the frozen due, CLEAR zeroes it). Accommodation is added separately
   * by the caller — same as a fresh registration. Opening balance is handled exactly
   * like create(): set directly, then recompute takes over once accommodation is added.
   */
  async reactivate(id: string, dto: ReactivateStudentDto) {
    const tenantId = this.tenantCtx.tenantId;
    const existing = await this.prisma.student.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Student not found');
    if (existing.status !== 'LEFT') {
      throw new BadRequestException('Only a student who has left can be reactivated');
    }

    const data: any = { status: 'ACTIVE', leftAt: null };
    const fields: (keyof ReactivateStudentDto)[] = [
      'branchId', 'fullName', 'email', 'phone', 'gender',
      'aadhaarNumber', 'voterId', 'fatherName', 'motherName', 'emergencyContact',
      'permanentAddress', 'temporaryAddress', 'examTarget',
      'photoUrl', 'idProofUrl', 'aadhaarFrontUrl', 'aadhaarBackUrl', 'voterIdUrl',
    ];
    for (const f of fields) {
      if (dto[f] !== undefined) data[f] = dto[f];
    }
    if (dto.dateOfBirth !== undefined) data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.balanceAction === 'CLEAR') data.outstandingBalance = 0;

    let updated;
    try {
      updated = await this.prisma.student.update({ where: { id }, data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const msg = describeUniqueTarget((err.meta as any)?.target) ?? 'Duplicate record';
        throw new ConflictException(msg);
      }
      throw err;
    }

    await this.audit.record({
      tenantId,
      userId: this.tenantCtx.userId,
      action: 'REACTIVATE_STUDENT',
      entity: 'students',
      entityId: id,
      diff: { before: existing, after: updated, balanceAction: dto.balanceAction ?? 'CARRY' },
    });
    return { ...updated, outstandingBalance: Number((updated as any).outstandingBalance ?? 0) };
  }

  /**
   * Record a payment against a student's account balance. The full amount is applied
   * to the signed balance (positive = due, negative = advance/credit): paying more than
   * the due rolls the surplus into advance, and a payment with nothing due becomes advance.
   */
  async settleBalance(id: string, dto: SettleBalanceDto) {
    const student = await this.findOne(id);
    const tenantId = student.tenantId;
    const current = Number(student.outstandingBalance ?? 0);
    const amount = Number(dto.amount);

    const isAdvance = current <= 0;
    const tag = isAdvance ? '[Advance]' : '[Balance]';
    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        branchId: student.branchId,
        studentId: id,
        amount,
        method: (dto.method as any) ?? PaymentMethod.CASH,
        status: PaymentStatus.PAID,
        paidAt: new Date(),
        notes: dto.notes ? `${tag} ${dto.notes}` : `${tag} payment`,
      },
    });

    // Balance is derived — recompute from all payments + active accommodations
    // (the payment just created is now included).
    const newBalance = await this.balance.recompute(tenantId, id);
    await this.audit.record({
      tenantId,
      userId: this.tenantCtx.userId,
      action: 'SETTLE_BALANCE',
      entity: 'students',
      entityId: id,
      diff: { applied: amount, before: current, after: newBalance, paymentId: payment.id },
    });
    return { studentId: id, applied: amount, outstandingBalance: newBalance, paymentId: payment.id };
  }

  /** Admin reset of a student's kiosk password — returns a temp password to share, forces change. */
  async resetPassword(id: string, newPassword?: string) {
    const existing = await this.findOne(id);
    const tempPassword = newPassword?.trim() || this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await this.prisma.student.update({
      where: { id: existing.id },
      data: { passwordHash, mustChangePassword: true },
    });
    await this.audit.record({
      tenantId: existing.tenantId,
      userId: this.tenantCtx.userId,
      action: 'RESET_STUDENT_PASSWORD',
      entity: 'students',
      entityId: existing.id,
    });
    return { studentId: existing.id, tempPassword };
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const block = (n: number) =>
      Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `Stu-${block(4)}`;
  }

  /** Generates next sequential code like STU-0001 per-tenant. */
  private async nextStudentCode(tenantId: string): Promise<string> {
    const last = await this.prisma.student.findFirst({
      where: { tenantId, code: { startsWith: 'STU-' } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const lastNum = last ? parseInt(last.code.replace('STU-', ''), 10) : 0;
    return `STU-${String(lastNum + 1).padStart(4, '0')}`;
  }
}
