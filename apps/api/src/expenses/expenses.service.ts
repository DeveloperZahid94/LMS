import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateExpenseDto, ExpenseListQueryDto, PayExpenseDto, UpdateExpenseDto,
} from './dto/expenses.dto';

type ExpensePaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

/** Derives the settlement status from the total and how much has been paid. */
function deriveStatus(amount: number, paid: number): ExpensePaymentStatus {
  if (paid <= 0) return 'UNPAID';
  if (paid >= amount) return 'PAID';
  return 'PARTIAL';
}

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
    private audit: AuditService,
  ) {}

  async list(q: ExpenseListQueryDto) {
    const tenantId = this.tenantCtx.tenantId;
    const where: any = { tenantId };
    if (q.branchId) where.branchId = q.branchId;
    if (q.staffId) where.staffId = q.staffId;
    if (q.category) where.category = q.category;
    if (q.paymentStatus) where.paymentStatus = q.paymentStatus;
    if (q.from || q.to) {
      where.expenseDate = {};
      if (q.from) where.expenseDate.gte = new Date(q.from);
      if (q.to) where.expenseDate.lte = new Date(q.to);
    }

    const rows = await this.prisma.expense.findMany({
      where,
      orderBy: { expenseDate: 'desc' },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        staff: { select: { id: true, fullName: true, role: true } },
        payments: { orderBy: { paidDate: 'asc' } },
      },
    });
    return rows.map((r) => this.shape(r));
  }

  async stats(branchId?: string) {
    const tenantId = this.tenantCtx.tenantId;
    const where: any = { tenantId };
    if (branchId) where.branchId = branchId;

    const rows = await this.prisma.expense.findMany({
      where,
      select: { amount: true, paidAmount: true, advanceApplied: true, paymentStatus: true, category: true, expenseDate: true },
    });

    // Start of the current month, used to split "this month" from all-time.
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalAmount = 0;
    let thisMonthAmount = 0;
    let thisMonthCount = 0;
    let outstandingAmount = 0;
    let outstandingCount = 0;
    const byCategory: Record<string, number> = {};

    for (const r of rows) {
      const amt = Number(r.amount ?? 0);
      totalAmount += amt;
      byCategory[r.category] = (byCategory[r.category] ?? 0) + amt;
      if (new Date(r.expenseDate) >= monthStart) {
        thisMonthAmount += amt;
        thisMonthCount++;
      }
      if (r.paymentStatus !== 'PAID') {
        outstandingAmount += amt - Number(r.paidAmount ?? 0) - Number((r as any).advanceApplied ?? 0);
        outstandingCount++;
      }
    }

    const categories = Object.entries(byCategory)
      .map(([category, amount]) => ({ category, amount: Number(amount.toFixed(2)) }))
      .sort((a, b) => b.amount - a.amount);

    return {
      total: rows.length,
      totalAmount: Number(totalAmount.toFixed(2)),
      thisMonthAmount: Number(thisMonthAmount.toFixed(2)),
      thisMonthCount,
      outstandingAmount: Number(outstandingAmount.toFixed(2)),
      outstandingCount,
      topCategory: categories[0] ?? null,
      categories,
    };
  }

  async get(id: string) {
    const tenantId = this.tenantCtx.tenantId;
    const row = await this.prisma.expense.findFirst({
      where: { id, tenantId },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        staff: { select: { id: true, fullName: true, role: true } },
        payments: { orderBy: { paidDate: 'asc' } },
      },
    });
    if (!row) throw new NotFoundException('Expense not found');
    return this.shape(row);
  }

  async create(dto: CreateExpenseDto) {
    const tenantId = this.tenantCtx.tenantId;

    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, tenantId } });
      if (!branch) throw new BadRequestException('Branch not found in this tenant');
    }
    if (dto.staffId) await this.assertStaff(tenantId, dto.staffId);

    // Vendor advance: draw the vendor's prepaid wallet down against this expense first.
    let advanceApplied = 0;
    if (dto.vendorId) {
      const vendor = await this.prisma.vendor.findFirst({ where: { id: dto.vendorId, tenantId } });
      if (!vendor) throw new BadRequestException('Vendor not found in this tenant');
      advanceApplied = Math.min(Number(vendor.advanceBalance ?? 0), dto.amount);
    }

    // Credit (pay-later): cash paidAmount covers the part not met by advance; otherwise the
    // remaining (after advance) is paid in full now. Settled = advanceApplied + cash paid.
    const remainingAfterAdvance = dto.amount - advanceApplied;
    const paidAmount = dto.onCredit
      ? Math.min(dto.paidAmount ?? 0, remainingAfterAdvance)
      : remainingAfterAdvance;
    const paymentStatus = deriveStatus(dto.amount, paidAmount + advanceApplied);

    const expenseDate = dto.expenseDate ? new Date(dto.expenseDate) : new Date();
    const created = await this.prisma.expense.create({
      data: {
        tenantId,
        branchId: dto.branchId ?? null,
        category: dto.category as any,
        title: dto.title.trim(),
        amount: dto.amount,
        expenseDate,
        paymentMethod: dto.paymentMethod ?? null,
        vendor: dto.vendor?.trim() || null,
        vendorId: dto.vendorId ?? null,
        staffId: dto.staffId ?? null,
        notes: dto.notes ?? null,
        paymentStatus: paymentStatus as any,
        paidAmount,
        advanceApplied,
        dueDate: dto.onCredit && dto.dueDate ? new Date(dto.dueDate) : null,
        paidDate: paymentStatus === 'PAID' ? new Date() : null,
        // Seed the ledger with the up-front amount paid on a credit expense, so its
        // payment history matches paidAmount from day one.
        ...(dto.onCredit && paidAmount > 0 && {
          payments: {
            create: {
              tenantId,
              amount: paidAmount,
              paymentMethod: dto.paymentMethod ?? null,
              notes: 'Initial payment',
              paidDate: expenseDate,
            },
          },
        }),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        staff: { select: { id: true, fullName: true, role: true } },
        payments: { orderBy: { paidDate: 'asc' } },
      },
    });

    // Draw the applied amount out of the vendor's advance wallet.
    if (dto.vendorId && advanceApplied > 0) {
      await this.prisma.vendor.update({
        where: { id: dto.vendorId },
        data: { advanceBalance: { decrement: advanceApplied } },
      });
    }

    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'EXPENSE_CREATE', entity: 'expenses', entityId: created.id, diff: { after: created, advanceApplied },
    });
    return this.shape(created);
  }

  async update(id: string, dto: UpdateExpenseDto) {
    const tenantId = this.tenantCtx.tenantId;
    const existing = await this.prisma.expense.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Expense not found');

    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, tenantId } });
      if (!branch) throw new BadRequestException('Branch not found in this tenant');
    }
    if (dto.staffId) await this.assertStaff(tenantId, dto.staffId);

    // Recompute the credit fields whenever the amount or any credit input changes.
    const creditTouched =
      dto.onCredit !== undefined || dto.paidAmount !== undefined ||
      dto.dueDate !== undefined || dto.amount !== undefined;
    let creditData: any = {};
    if (creditTouched) {
      const amount = dto.amount !== undefined ? dto.amount : Number(existing.amount);
      let paid: number;
      if (dto.onCredit === false) paid = amount;                          // explicitly settled in full
      else if (dto.paidAmount !== undefined) paid = Math.min(dto.paidAmount, amount);
      else paid = Math.min(Number(existing.paidAmount), amount);          // amount may have shrunk
      const status = deriveStatus(amount, paid);
      creditData = {
        paymentStatus: status as any,
        paidAmount: paid,
        paidDate: status === 'PAID' ? (existing.paidDate ?? new Date()) : null,
      };
      if (status === 'PAID') creditData.dueDate = null;                   // nothing left to be due
      else if (dto.dueDate !== undefined) creditData.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.category !== undefined && { category: dto.category as any }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.expenseDate !== undefined && { expenseDate: new Date(dto.expenseDate) }),
        ...(dto.branchId !== undefined && { branchId: dto.branchId || null }),
        ...(dto.paymentMethod !== undefined && { paymentMethod: dto.paymentMethod || null }),
        ...(dto.vendor !== undefined && { vendor: dto.vendor?.trim() || null }),
        ...(dto.vendorId !== undefined && { vendorId: dto.vendorId || null }),
        ...(dto.staffId !== undefined && { staffId: dto.staffId || null }),
        ...(dto.notes !== undefined && { notes: dto.notes || null }),
        ...creditData,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        staff: { select: { id: true, fullName: true, role: true } },
        payments: { orderBy: { paidDate: 'asc' } },
      },
    });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'EXPENSE_UPDATE', entity: 'expenses', entityId: id, diff: { before: existing, after: updated },
    });
    return this.shape(updated);
  }

  /** Records a payment against a credit expense, reducing its outstanding balance. */
  async pay(id: string, dto: PayExpenseDto) {
    const tenantId = this.tenantCtx.tenantId;
    const existing = await this.prisma.expense.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Expense not found');

    const amount = Number(existing.amount);
    const advanceApplied = Number((existing as any).advanceApplied ?? 0);
    const outstanding = amount - Number(existing.paidAmount) - advanceApplied;
    if (outstanding <= 0) throw new BadRequestException('This expense is already paid in full');
    if (dto.amount > outstanding + 0.001) {
      throw new BadRequestException(`Payment exceeds the outstanding balance of ${outstanding.toFixed(2)}`);
    }

    const paid = Math.min(Number(existing.paidAmount) + dto.amount, amount - advanceApplied);
    const status = deriveStatus(amount, paid + advanceApplied);
    const paidDate = dto.paidDate ? new Date(dto.paidDate) : new Date();

    // Record the payment in the ledger and roll the running total forward together.
    const [, updated] = await this.prisma.$transaction([
      this.prisma.expensePayment.create({
        data: {
          tenantId,
          expenseId: id,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod ?? null,
          notes: dto.notes?.trim() || null,
          paidDate,
        },
      }),
      this.prisma.expense.update({
        where: { id },
        data: {
          paidAmount: paid,
          paymentStatus: status as any,
          paidDate: status === 'PAID' ? paidDate : null,
          ...(dto.paymentMethod && { paymentMethod: dto.paymentMethod }),
        },
        include: {
          branch: { select: { id: true, name: true, code: true } },
          staff: { select: { id: true, fullName: true, role: true } },
          payments: { orderBy: { paidDate: 'asc' } },
        },
      }),
    ]);
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'EXPENSE_PAY', entity: 'expenses', entityId: id,
      diff: { before: existing, after: updated, payment: dto.amount },
    });
    return this.shape(updated);
  }

  async remove(id: string) {
    const tenantId = this.tenantCtx.tenantId;
    const existing = await this.prisma.expense.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Expense not found');

    const advanceApplied = Number((existing as any).advanceApplied ?? 0);
    await this.prisma.expense.delete({ where: { id } });
    // Refund any advance this expense had consumed back to the vendor's wallet.
    if (existing.vendorId && advanceApplied > 0) {
      await this.prisma.vendor.update({
        where: { id: existing.vendorId },
        data: { advanceBalance: { increment: advanceApplied } },
      }).catch(() => { /* vendor may have been removed; ignore */ });
    }
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'EXPENSE_DELETE', entity: 'expenses', entityId: id, diff: { before: existing },
    });
    return { id, deleted: true };
  }

  /** Ensures the given staff id is a real user in this tenant. */
  private async assertStaff(tenantId: string, staffId: string) {
    const staff = await this.prisma.user.findFirst({ where: { id: staffId, tenantId } });
    if (!staff) throw new BadRequestException('Staff member not found in this tenant');
  }

  private shape(r: any) {
    return {
      id: r.id,
      tenantId: r.tenantId,
      branchId: r.branchId,
      category: r.category,
      title: r.title,
      amount: r.amount != null ? Number(r.amount) : 0,
      expenseDate: r.expenseDate,
      paymentMethod: r.paymentMethod ?? null,
      vendor: r.vendor ?? null,
      vendorId: r.vendorId ?? null,
      staffId: r.staffId ?? null,
      staff: r.staff ?? null,
      notes: r.notes ?? null,
      branch: r.branch ?? null,
      paymentStatus: r.paymentStatus ?? 'PAID',
      paidAmount: r.paidAmount != null ? Number(r.paidAmount) : 0,
      advanceApplied: r.advanceApplied != null ? Number(r.advanceApplied) : 0,
      outstanding: Number((
        (r.amount != null ? Number(r.amount) : 0)
        - (r.paidAmount != null ? Number(r.paidAmount) : 0)
        - (r.advanceApplied != null ? Number(r.advanceApplied) : 0)
      ).toFixed(2)),
      dueDate: r.dueDate ?? null,
      paidDate: r.paidDate ?? null,
      payments: Array.isArray(r.payments)
        ? r.payments.map((p: any) => ({
            id: p.id,
            amount: p.amount != null ? Number(p.amount) : 0,
            paymentMethod: p.paymentMethod ?? null,
            notes: p.notes ?? null,
            paidDate: p.paidDate,
          }))
        : [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
