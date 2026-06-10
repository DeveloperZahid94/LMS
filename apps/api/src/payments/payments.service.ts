import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { RAZORPAY_SERVICE, RazorpayService } from '../integrations/razorpay.service';
import { WHATSAPP_SERVICE, WhatsAppService } from '../integrations/whatsapp.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { SeatAssignmentsService } from '../seat-assignments/seat-assignments.service';
import { BalanceService } from '../balance/balance.service';
import { EmailService } from '../email/email.service';
import { CreatePaymentDto, RazorpayCreateOrderDto, RazorpayVerifyDto } from './dto/payment.dto';
import { FeatureKey, PaymentStatus, PaymentMethod } from '@lms/shared';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
    private audit: AuditService,
    private featureFlags: FeatureFlagsService,
    private seatAssignments: SeatAssignmentsService,
    private balance: BalanceService,
    private email: EmailService,
    @Inject(RAZORPAY_SERVICE) private razorpay: RazorpayService,
    @Inject(WHATSAPP_SERVICE) private whatsapp: WhatsAppService,
  ) {}

  /** Email a payment receipt to the student via the tenant's configured provider. */
  async emailReceipt(id: string) {
    const tenantId = this.tenantCtx.tenantId;
    const payment = await this.prisma.payment.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { student: true, tenant: { select: { name: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (!payment.student.email) throw new BadRequestException('This student has no email on file');
    const res = await this.email.sendTemplate({
      tenantId,
      to: payment.student.email,
      template: 'PAYMENT_RECEIPT',
      data: {
        orgName: payment.tenant.name,
        fullName: payment.student.fullName,
        amount: Number(payment.amount),
        method: payment.method,
        receiptNo: payment.receiptNumber ?? payment.id.slice(0, 8).toUpperCase(),
        date: (payment.paidAt ?? payment.createdAt).toLocaleString('en-IN'),
      },
    });
    if (!res.ok) {
      throw new BadRequestException(
        res.skipped ? 'Email is not enabled for this tenant (ask SuperAdmin to configure it).' : (res.error || 'Could not send email'),
      );
    }
    return { ok: true };
  }

  async list(opts: {
    branchId?: string;
    status?: PaymentStatus;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    sortBy?: 'date' | 'amount' | 'student';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  } = {}) {
    const tenantId = this.tenantCtx.tenantId;
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(Number(opts.limit) || 25, 5000);
    const order: 'asc' | 'desc' = opts.sortOrder === 'asc' ? 'asc' : 'desc';

    const and: any[] = [{ tenantId }, { deletedAt: null }];
    if (opts.branchId) and.push({ branchId: opts.branchId });
    if (opts.status) and.push({ status: opts.status });
    if (opts.dateFrom || opts.dateTo) {
      // Effective payment date = paidAt when present, else createdAt.
      const range: any = {};
      if (opts.dateFrom) range.gte = new Date(opts.dateFrom);
      if (opts.dateTo) {
        const to = new Date(opts.dateTo);
        to.setHours(23, 59, 59, 999);
        range.lte = to;
      }
      and.push({ OR: [{ paidAt: range }, { paidAt: null, createdAt: range }] });
    }
    if (opts.search?.trim()) {
      const s = opts.search.trim();
      and.push({
        student: {
          OR: [
            { fullName: { contains: s, mode: 'insensitive' } },
            { code: { contains: s, mode: 'insensitive' } },
            { phone: { contains: s, mode: 'insensitive' } },
          ],
        },
      });
    }
    const where = { AND: and };

    const orderBy =
      opts.sortBy === 'amount' ? { amount: order } :
      opts.sortBy === 'student' ? { student: { fullName: order } } :
      { createdAt: order };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: {
          student: { select: { id: true, code: true, fullName: true, phone: true, email: true } },
          branch:  { select: { id: true, name: true, code: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    // Hydrate each row with the per-SERVICE remaining balance after that payment.
    // `balance` = the service's monthly rate minus the cumulative amount paid
    // toward that same service up to and including this payment. This keeps each
    // service's balance independent (a tiffin payment never shows the cabin fee).
    const studentIds = [...new Set(data.map((p) => p.studentId))];
    const seatExp = new Map<string, number>();
    const pgExp = new Map<string, number>();
    const tiffinExp = new Map<string, number>();
    const cumById = new Map<string, number>(); // payment id → running paid for its (student, purpose)
    if (studentIds.length) {
      const [seats, pgs, tiffins, allPaid] = await Promise.all([
        this.prisma.seatAssignment.findMany({
          where: { tenantId, studentId: { in: studentIds }, status: { in: ['TEMPORARY', 'CONFIRMED'] } },
          select: { studentId: true, monthlyRate: true },
        }),
        this.prisma.pgRoomAssignment.findMany({
          where: { tenantId, studentId: { in: studentIds }, status: 'ACTIVE' },
          select: { studentId: true, monthlyRate: true },
        }),
        (this.prisma as any).tiffinSubscription.findMany({
          where: { tenantId, studentId: { in: studentIds }, status: { in: ['ACTIVE', 'PAUSED'] } },
          select: { studentId: true, monthlyRate: true },
        }),
        // All PAID payments for these students, oldest first, to build a running total per service.
        this.prisma.payment.findMany({
          where: { tenantId, studentId: { in: studentIds }, status: 'PAID', deletedAt: null },
          select: { id: true, studentId: true, purpose: true, amount: true, discount: true, createdAt: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      ]);
      const add = (m: Map<string, number>, sid: string, rate: any) =>
        m.set(sid, (m.get(sid) ?? 0) + (rate ? Number(rate) : 0));
      for (const a of seats) add(seatExp, a.studentId, a.monthlyRate);
      for (const a of pgs as any[]) add(pgExp, a.studentId, a.monthlyRate);
      for (const t of tiffins as any[]) add(tiffinExp, t.studentId, t.monthlyRate);

      const runner = new Map<string, number>();
      for (const p of allPaid as any[]) {
        const key = `${p.studentId}|${p.purpose}`;
        const next = (runner.get(key) ?? 0) + Number(p.amount) + Number(p.discount ?? 0);
        runner.set(key, next);
        cumById.set(p.id, next);
      }
    }
    const expectedFor = (sid: string, purpose: string): number =>
      purpose === 'SEAT' ? (seatExp.get(sid) ?? 0)
      : purpose === 'PG' ? (pgExp.get(sid) ?? 0)
      : purpose === 'TIFFIN' ? (tiffinExp.get(sid) ?? 0)
      : 0; // GENERAL has no single service to balance against
    const hydrated = data.map((p) => {
      const purpose = (p as any).purpose as string;
      const monthlyFee = expectedFor(p.studentId, purpose);
      const cumulative = cumById.get(p.id) ?? (Number(p.amount) + Number((p as any).discount ?? 0));
      const balance = monthlyFee > 0 ? Math.max(0, monthlyFee - cumulative) : 0;
      return { ...p, discount: Number((p as any).discount ?? 0), monthlyFee, balance };
    });
    return { data: hydrated, total, page, limit };
  }

  /**
   * Per-student payment summary for the detail view: full history, total paid,
   * the student's active allocations (seat + PG) and their combined monthly fee
   * so the UI can show balance and whether a payment was full or partial.
   */
  async studentSummary(studentId: string) {
    const tenantId = this.tenantCtx.tenantId;
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true, code: true, fullName: true, phone: true },
    });
    if (!student) throw new NotFoundException('Student not found in this tenant');

    const payments = await this.prisma.payment.findMany({
      where: { tenantId, studentId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, amount: true, discount: true, discountReason: true, method: true, status: true, purpose: true, paidAt: true, createdAt: true, notes: true },
    });
    const totalPaid = payments
      .filter((p) => p.status === PaymentStatus.PAID)
      .reduce((s, p) => s + Number(p.amount), 0);

    const [seats, pgs, tiffins] = await Promise.all([
      this.prisma.seatAssignment.findMany({
        where: { tenantId, studentId, status: { in: ['TEMPORARY', 'CONFIRMED'] } },
        include: { seat: { select: { code: true } } },
      }),
      this.prisma.pgRoomAssignment.findMany({
        where: { tenantId, studentId, status: 'ACTIVE' },
        include: { room: { select: { roomNumber: true } } },
      }),
      (this.prisma as any).tiffinSubscription.findMany({
        where: { tenantId, studentId, status: { in: ['ACTIVE', 'PAUSED'] } },
      }),
    ]);

    // ----- Per-service dues breakdown -----
    // Seat & PG: expected rate minus PAID payments tagged with that purpose.
    // Tiffin: authoritative from the subscription's own paid/balance ledger.
    const paidFor = (purpose: string) => payments
      .filter((p) => p.status === PaymentStatus.PAID && (p as any).purpose === purpose)
      .reduce((s, p) => s + Number(p.amount) + Number(p.discount ?? 0), 0);

    const seatExpected = seats.reduce((s, a) => s + (a.monthlyRate ? Number(a.monthlyRate) : 0), 0);
    const pgExpected = pgs.reduce((s: number, a: any) => s + (a.monthlyRate ? Number(a.monthlyRate) : 0), 0);
    const tiffinExpected = tiffins.reduce((s: number, t: any) => s + Number(t.monthlyRate ?? 0), 0);
    const tiffinPaid = tiffins.reduce((s: number, t: any) => s + Number(t.paidAmount ?? 0), 0);
    const tiffinDueSigned = tiffins.reduce((s: number, t: any) => s + Number(t.balance ?? 0), 0);

    const seatPaid = paidFor('SEAT');
    const pgPaid = paidFor('PG');
    const generalPaid = paidFor('GENERAL');

    const seatDue = Math.max(0, seatExpected - seatPaid);
    const pgDue = Math.max(0, pgExpected - pgPaid);
    const tiffinDue = Math.max(0, tiffinDueSigned);
    const totalDue = Math.max(0, seatDue + pgDue + tiffinDue - generalPaid);

    const breakdown = {
      seat:   { expected: seatExpected,   paid: seatPaid,   due: seatDue,   active: seats.length > 0 },
      pg:     { expected: pgExpected,     paid: pgPaid,     due: pgDue,     active: pgs.length > 0 },
      tiffin: { expected: tiffinExpected, paid: tiffinPaid, due: tiffinDue, active: tiffins.length > 0 },
      generalPaid,
      totalDue,
    };

    const allocations = [
      ...seats.map((a) => ({
        type: 'SEAT' as const,
        label: `Seat ${a.seat.code} · ${a.shift}`,
        monthlyRate: a.monthlyRate ? Number(a.monthlyRate) : 0,
        nextDueDate: a.nextDueDate,
      })),
      ...pgs.map((a) => ({
        type: 'PG' as const,
        label: `PG ${a.room.roomNumber} · Bed ${a.bedNumber}`,
        monthlyRate: a.monthlyRate ? Number(a.monthlyRate) : 0,
        nextDueDate: a.nextDueDate,
      })),
    ];
    const monthlyTotal = allocations.reduce((s, a) => s + a.monthlyRate, 0);

    return {
      student,
      payments: payments.map((p) => ({ ...p, amount: Number(p.amount), discount: Number(p.discount ?? 0) })),
      totalPaid,
      monthlyTotal,
      allocations,
      breakdown,
    };
  }

  /** Soft-delete a payment with a required reason. Kept for audit; excluded everywhere. */
  async softDelete(id: string, reason?: string) {
    if (!reason?.trim()) throw new BadRequestException('A reason is required to delete a payment');
    const tenantId = this.tenantCtx.tenantId;
    const payment = await this.prisma.payment.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!payment) throw new NotFoundException('Payment not found');
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { deletedAt: new Date(), deletedReason: reason.trim(), deletedById: this.tenantCtx.userId ?? null },
    });
    await this.audit.record({
      tenantId,
      userId: this.tenantCtx.userId,
      action: 'DELETE_PAYMENT',
      entity: 'payments',
      entityId: payment.id,
      diff: { reason: reason.trim(), before: payment },
    });
    // Re-evaluate allocation status — removing this payment may drop the student
    // back below the 50% threshold (CONFIRMED → TEMPORARY).
    await this.seatAssignments.reconcileAfterPaymentChange(tenantId, payment.studentId);
    // Deleting a payment raises what the student owes — recompute the derived balance.
    await this.balance.recompute(tenantId, payment.studentId);
    return { ok: true };
  }

  async recordManual(dto: CreatePaymentDto) {
    const tenantId = this.tenantCtx.tenantId;
    await this.assertStudentInTenant(dto.studentId, tenantId);

    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        studentId: dto.studentId,
        enrollmentId: dto.enrollmentId ?? null,
        amount: dto.amount,
        discount: dto.discount ?? 0,
        discountReason: dto.discountReason?.trim() || null,
        method: dto.method,
        status: PaymentStatus.PAID,
        purpose: (dto.purpose ?? 'GENERAL') as any,
        paidAt: new Date(),
        notes: dto.notes ?? null,
      },
      // Return the student/branch so the client's success handler (and the row it
      // shows) has p.student.fullName — without this the modal stays stuck.
      include: {
        student: { select: { id: true, code: true, fullName: true, phone: true, email: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    if (dto.nextDueDate) {
      const due = new Date(dto.nextDueDate);
      const purpose = dto.purpose ?? 'GENERAL';
      // Advance the next-due date on the SAME service the payment is for — a PG or
      // tiffin payment must not move the cabin/seat due date (and vice-versa).
      if (purpose === 'PG') {
        await this.prisma.pgRoomAssignment.updateMany({
          where: { tenantId, studentId: dto.studentId, status: 'ACTIVE' },
          data: { nextDueDate: due },
        });
      } else if (purpose === 'TIFFIN') {
        await (this.prisma as any).tiffinSubscription.updateMany({
          where: { tenantId, studentId: dto.studentId, status: { in: ['ACTIVE', 'PAUSED'] } },
          data: { nextDueDate: due },
        });
      } else {
        // SEAT (and legacy GENERAL) → seat allocations.
        await this.prisma.seatAssignment.updateMany({
          where: { tenantId, studentId: dto.studentId, status: { in: ['TEMPORARY', 'CONFIRMED'] } },
          data: { nextDueDate: due },
        });
      }
    }

    await this.notifyReceipt(payment.id);
    await this.seatAssignments.maybePromoteAfterPayment(tenantId, dto.studentId);
    // Account balance is derived — recompute from all payments + active accommodations.
    // (Every payment now reduces the balance; the old `applyToAccount` opt-in is obsolete.)
    await this.balance.recompute(tenantId, dto.studentId);
    await this.audit.record({
      tenantId,
      userId: this.tenantCtx.userId,
      action: 'CREATE_PAYMENT',
      entity: 'payments',
      entityId: payment.id,
      diff: { after: payment },
    });
    return payment;
  }

  async createRazorpayOrder(dto: RazorpayCreateOrderDto) {
    const tenantId = this.tenantCtx.tenantId;
    const enabled = await this.featureFlags.isEnabled(tenantId, FeatureKey.PAYMENT_GATEWAY);
    if (!enabled) throw new BadRequestException('Payment gateway is disabled for this tenant');

    await this.assertStudentInTenant(dto.studentId, tenantId);

    // Pre-create a PENDING payment row to anchor the Razorpay order to.
    const pending = await this.prisma.payment.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        studentId: dto.studentId,
        enrollmentId: dto.enrollmentId ?? null,
        amount: dto.amount,
        method: PaymentMethod.RAZORPAY,
        status: PaymentStatus.PENDING,
      },
    });

    const order = await this.razorpay.createOrder(dto.amount * 100, 'INR', pending.id);
    await this.prisma.payment.update({
      where: { id: pending.id },
      data: { razorpayOrderId: order.orderId },
    });
    return { paymentId: pending.id, ...order };
  }

  async verifyRazorpay(dto: RazorpayVerifyDto) {
    const tenantId = this.tenantCtx.tenantId;
    const payment = await this.prisma.payment.findFirst({
      where: { id: dto.paymentId, tenantId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.razorpayOrderId !== dto.razorpayOrderId) {
      throw new BadRequestException('Order mismatch');
    }
    const ok = this.razorpay.verifySignature(
      dto.razorpayOrderId, dto.razorpayPaymentId, dto.razorpaySignature,
    );
    if (!ok) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      throw new BadRequestException('Invalid signature');
    }
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.PAID,
        razorpayPaymentId: dto.razorpayPaymentId,
        razorpaySignature: dto.razorpaySignature,
        paidAt: new Date(),
      },
    });
    await this.notifyReceipt(updated.id);
    await this.seatAssignments.maybePromoteAfterPayment(tenantId, updated.studentId);
    await this.balance.recompute(tenantId, updated.studentId);
    return updated;
  }

  private async assertStudentInTenant(studentId: string, tenantId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) throw new BadRequestException('Student not found in this tenant');
  }

  private async notifyReceipt(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { student: true },
    });
    if (!payment) return;
    const waEnabled = await this.featureFlags.isEnabled(payment.tenantId, FeatureKey.WHATSAPP);
    if (!waEnabled) return;
    await this.whatsapp.send({
      to: payment.student.phone,
      body: `Hi ${payment.student.fullName}, we received your payment of ₹${payment.amount}. Thank you!`,
    });
  }
}
