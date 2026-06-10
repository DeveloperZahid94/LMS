import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { BalanceService } from '../balance/balance.service';
import {
  CollectTiffinDto, CreateTiffinSubscriptionDto, PauseTiffinDto, ResumeTiffinDto,
  TiffinListQueryDto, UpdateTiffinSubscriptionDto,
} from './dto/tiffin.dto';
import { PaymentMethod, PaymentStatus } from '@lms/shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class TiffinService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
    private audit: AuditService,
    private balance: BalanceService,
  ) {}

  // `as any` indirection until `npx prisma generate` is re-run with the new
  // Tiffin models — mirrors the PG Rooms service convention.
  private get db(): any { return this.prisma as any; }

  async list(q: TiffinListQueryDto) {
    const tenantId = this.tenantCtx.tenantId;
    const where: any = { tenantId };
    if (q.studentId) where.studentId = q.studentId;
    if (q.branchId) where.branchId = q.branchId;
    if (q.status) where.status = q.status;

    const rows = await this.db.tiffinSubscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        student: { select: { id: true, code: true, fullName: true, phone: true, email: true } },
        branch: { select: { id: true, name: true, code: true } },
        pauses: { orderBy: { pausedAt: 'desc' } },
      },
    });
    return rows.map((r: any) => this.shape(r));
  }

  async stats(branchId?: string) {
    const tenantId = this.tenantCtx.tenantId;
    const where: any = { tenantId };
    if (branchId) where.branchId = branchId;

    const rows = await this.db.tiffinSubscription.findMany({
      where,
      select: { status: true, monthlyRate: true },
    });
    let active = 0, paused = 0, ended = 0, activeRevenue = 0;
    for (const r of rows) {
      if (r.status === 'ACTIVE') { active++; activeRevenue += Number(r.monthlyRate ?? 0); }
      else if (r.status === 'PAUSED') paused++;
      else ended++;
    }
    return { total: rows.length, active, paused, ended, activeRevenue };
  }

  async get(id: string) {
    const tenantId = this.tenantCtx.tenantId;
    const row = await this.db.tiffinSubscription.findFirst({
      where: { id, tenantId },
      include: {
        student: { select: { id: true, code: true, fullName: true, phone: true, email: true } },
        branch: { select: { id: true, name: true, code: true } },
        pauses: { orderBy: { pausedAt: 'desc' } },
      },
    });
    if (!row) throw new NotFoundException('Tiffin subscription not found');
    return this.shape(row);
  }

  async create(dto: CreateTiffinSubscriptionDto) {
    const tenantId = this.tenantCtx.tenantId;

    const student = await this.prisma.student.findFirst({ where: { id: dto.studentId, tenantId } });
    if (!student) throw new BadRequestException('Student not found in this tenant');
    const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, tenantId } });
    if (!branch) throw new BadRequestException('Branch not found in this tenant');

    // A student can hold at most one live (active or paused) tiffin subscription.
    const existing = await this.db.tiffinSubscription.findFirst({
      where: { tenantId, studentId: dto.studentId, status: { in: ['ACTIVE', 'PAUSED'] } },
    });
    if (existing) throw new BadRequestException('Student already has an active tiffin subscription');

    const paid = Number(dto.initialPayment ?? 0);
    const balance = Number((Number(dto.monthlyRate) - paid).toFixed(2));
    const created = await this.db.tiffinSubscription.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        studentId: dto.studentId,
        mealType: dto.mealType,
        mealPlan: dto.mealPlan,
        monthlyRate: dto.monthlyRate,
        paidAmount: paid,
        balance,
        startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
        nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : null,
        deliveryAssignee: dto.deliveryAssignee ?? null,
        deliveryPhone: dto.deliveryPhone ?? null,
        notes: dto.notes ?? null,
        status: 'ACTIVE',
      },
      include: {
        student: { select: { id: true, code: true, fullName: true, phone: true, email: true } },
        branch: { select: { id: true, name: true, code: true } },
        pauses: true,
      },
    });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'TIFFIN_SUBSCRIBE', entity: 'tiffin_subscriptions', entityId: created.id, diff: { after: created },
    });
    await this.balance.recompute(tenantId, dto.studentId);
    return this.shape(created);
  }

  async update(id: string, dto: UpdateTiffinSubscriptionDto) {
    const tenantId = this.tenantCtx.tenantId;
    const existing = await this.db.tiffinSubscription.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Tiffin subscription not found');

    const updated = await this.db.tiffinSubscription.update({
      where: { id },
      data: {
        ...(dto.mealType !== undefined && { mealType: dto.mealType }),
        ...(dto.mealPlan !== undefined && { mealPlan: dto.mealPlan }),
        ...(dto.monthlyRate !== undefined && { monthlyRate: dto.monthlyRate }),
        ...(dto.nextDueDate !== undefined && { nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : null }),
        ...(dto.deliveryAssignee !== undefined && { deliveryAssignee: dto.deliveryAssignee || null }),
        ...(dto.deliveryPhone !== undefined && { deliveryPhone: dto.deliveryPhone || null }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: {
        student: { select: { id: true, code: true, fullName: true, phone: true, email: true } },
        branch: { select: { id: true, name: true, code: true } },
        pauses: { orderBy: { pausedAt: 'desc' } },
      },
    });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'TIFFIN_UPDATE', entity: 'tiffin_subscriptions', entityId: id, diff: { before: existing, after: updated },
    });
    return this.shape(updated);
  }

  async pause(id: string, dto: PauseTiffinDto) {
    const tenantId = this.tenantCtx.tenantId;
    const sub = await this.db.tiffinSubscription.findFirst({ where: { id, tenantId } });
    if (!sub) throw new NotFoundException('Tiffin subscription not found');
    if (sub.status !== 'ACTIVE') throw new BadRequestException('Only an active subscription can be paused');

    const pausedAt = dto.pausedAt ? new Date(dto.pausedAt) : new Date();
    await this.db.tiffinPause.create({
      data: { tenantId, subscriptionId: id, pausedAt, reason: dto.reason ?? null },
    });
    await this.db.tiffinSubscription.update({ where: { id }, data: { status: 'PAUSED' } });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'TIFFIN_PAUSE', entity: 'tiffin_subscriptions', entityId: id, diff: { pausedAt, reason: dto.reason },
    });
    await this.balance.recompute(tenantId, sub.studentId);
    return this.get(id);
  }

  async resume(id: string, dto: ResumeTiffinDto) {
    const tenantId = this.tenantCtx.tenantId;
    const sub = await this.db.tiffinSubscription.findFirst({ where: { id, tenantId } });
    if (!sub) throw new NotFoundException('Tiffin subscription not found');
    if (sub.status !== 'PAUSED') throw new BadRequestException('Only a paused subscription can be resumed');

    const open = await this.db.tiffinPause.findFirst({
      where: { tenantId, subscriptionId: id, resumedAt: null },
      orderBy: { pausedAt: 'desc' },
    });
    const resumedAt = dto.resumedAt ? new Date(dto.resumedAt) : new Date();

    let days = 0;
    if (open) {
      days = Math.max(0, Math.round((resumedAt.getTime() - new Date(open.pausedAt).getTime()) / MS_PER_DAY));
      await this.db.tiffinPause.update({ where: { id: open.id }, data: { resumedAt, days } });
    }

    // Push the due date forward by the paused days so the student isn't billed for
    // skipped meals, and accumulate the total paused-days counter.
    const data: any = { status: 'ACTIVE', pausedDays: (sub.pausedDays ?? 0) + days };
    if (sub.nextDueDate && days > 0) {
      data.nextDueDate = new Date(new Date(sub.nextDueDate).getTime() + days * MS_PER_DAY);
    }
    await this.db.tiffinSubscription.update({ where: { id }, data });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'TIFFIN_RESUME', entity: 'tiffin_subscriptions', entityId: id, diff: { resumedAt, days },
    });
    await this.balance.recompute(tenantId, sub.studentId);
    return this.get(id);
  }

  async end(id: string) {
    const tenantId = this.tenantCtx.tenantId;
    const a = await this.db.tiffinSubscription.findFirst({ where: { id, tenantId } });
    if (!a) throw new NotFoundException('Tiffin subscription not found');
    if (a.status === 'ENDED') throw new BadRequestException('Subscription already ended');
    // Close any open pause so history stays consistent.
    await this.db.tiffinPause.updateMany({
      where: { tenantId, subscriptionId: id, resumedAt: null },
      data: { resumedAt: new Date() },
    });
    const updated = await this.db.tiffinSubscription.update({
      where: { id },
      data: { status: 'ENDED', endDate: new Date() },
    });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'TIFFIN_END', entity: 'tiffin_subscriptions', entityId: id, diff: { before: a, after: updated },
    });
    await this.balance.recompute(tenantId, a.studentId);
    return updated;
  }

  /**
   * Record a tiffin payment: logs a PAID payment tagged [Tiffin], adds to paidAmount,
   * and reduces the tiffin balance (overpay rolls into advance — negative balance).
   */
  async collect(id: string, dto: CollectTiffinDto) {
    const tenantId = this.tenantCtx.tenantId;
    const sub = await this.db.tiffinSubscription.findFirst({ where: { id, tenantId } });
    if (!sub) throw new NotFoundException('Tiffin subscription not found');
    const amount = Number(dto.amount);
    if (amount <= 0) throw new BadRequestException('Amount must be greater than 0');

    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        branchId: sub.branchId,
        studentId: sub.studentId,
        amount,
        method: (dto.method as any) ?? PaymentMethod.CASH,
        status: PaymentStatus.PAID,
        purpose: 'TIFFIN' as any,
        paidAt: new Date(),
        notes: dto.notes ? `[Tiffin] ${dto.notes}` : '[Tiffin] payment',
      },
    });

    const newPaid = Number((Number(sub.paidAmount ?? 0) + amount).toFixed(2));
    const newBalance = Number((Number(sub.balance ?? 0) - amount).toFixed(2));
    await this.db.tiffinSubscription.update({
      where: { id },
      data: { paidAmount: newPaid, balance: newBalance },
    });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'TIFFIN_COLLECT', entity: 'tiffin_subscriptions', entityId: id,
      diff: { amount, paidAmount: newPaid, balance: newBalance, paymentId: payment.id },
    });
    await this.balance.recompute(tenantId, sub.studentId);
    return this.get(id);
  }

  private shape(r: any) {
    const pauses = (r.pauses ?? []).map((p: any) => ({
      id: p.id,
      pausedAt: p.pausedAt,
      resumedAt: p.resumedAt,
      days: p.days,
      reason: p.reason,
    }));
    const currentPause = pauses.find((p: any) => !p.resumedAt) ?? null;
    return {
      id: r.id,
      tenantId: r.tenantId,
      branchId: r.branchId,
      studentId: r.studentId,
      mealType: r.mealType,
      mealPlan: r.mealPlan,
      monthlyRate: r.monthlyRate != null ? Number(r.monthlyRate) : 0,
      startDate: r.startDate,
      endDate: r.endDate,
      nextDueDate: r.nextDueDate,
      status: r.status,
      deliveryAssignee: r.deliveryAssignee ?? null,
      deliveryPhone: r.deliveryPhone ?? null,
      pausedDays: r.pausedDays ?? 0,
      paidAmount: r.paidAmount != null ? Number(r.paidAmount) : 0,
      balance: r.balance != null ? Number(r.balance) : 0,
      notes: r.notes,
      student: r.student ?? null,
      branch: r.branch ?? null,
      pauses,
      currentPause,
    };
  }
}
