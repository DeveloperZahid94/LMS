import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { CreateExpenseDto, ExpenseListQueryDto, UpdateExpenseDto } from './dto/expenses.dto';

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
    if (q.category) where.category = q.category;
    if (q.from || q.to) {
      where.expenseDate = {};
      if (q.from) where.expenseDate.gte = new Date(q.from);
      if (q.to) where.expenseDate.lte = new Date(q.to);
    }

    const rows = await this.prisma.expense.findMany({
      where,
      orderBy: { expenseDate: 'desc' },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
    return rows.map((r) => this.shape(r));
  }

  async stats(branchId?: string) {
    const tenantId = this.tenantCtx.tenantId;
    const where: any = { tenantId };
    if (branchId) where.branchId = branchId;

    const rows = await this.prisma.expense.findMany({
      where,
      select: { amount: true, category: true, expenseDate: true },
    });

    // Start of the current month, used to split "this month" from all-time.
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalAmount = 0;
    let thisMonthAmount = 0;
    let thisMonthCount = 0;
    const byCategory: Record<string, number> = {};

    for (const r of rows) {
      const amt = Number(r.amount ?? 0);
      totalAmount += amt;
      byCategory[r.category] = (byCategory[r.category] ?? 0) + amt;
      if (new Date(r.expenseDate) >= monthStart) {
        thisMonthAmount += amt;
        thisMonthCount++;
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
      topCategory: categories[0] ?? null,
      categories,
    };
  }

  async get(id: string) {
    const tenantId = this.tenantCtx.tenantId;
    const row = await this.prisma.expense.findFirst({
      where: { id, tenantId },
      include: { branch: { select: { id: true, name: true, code: true } } },
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

    const created = await this.prisma.expense.create({
      data: {
        tenantId,
        branchId: dto.branchId ?? null,
        category: dto.category as any,
        title: dto.title.trim(),
        amount: dto.amount,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : new Date(),
        paymentMethod: dto.paymentMethod ?? null,
        vendor: dto.vendor?.trim() || null,
        notes: dto.notes ?? null,
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'EXPENSE_CREATE', entity: 'expenses', entityId: created.id, diff: { after: created },
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
        ...(dto.notes !== undefined && { notes: dto.notes || null }),
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'EXPENSE_UPDATE', entity: 'expenses', entityId: id, diff: { before: existing, after: updated },
    });
    return this.shape(updated);
  }

  async remove(id: string) {
    const tenantId = this.tenantCtx.tenantId;
    const existing = await this.prisma.expense.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Expense not found');
    await this.prisma.expense.delete({ where: { id } });
    await this.audit.record({
      tenantId, userId: this.tenantCtx.userId,
      action: 'EXPENSE_DELETE', entity: 'expenses', entityId: id, diff: { before: existing },
    });
    return { id, deleted: true };
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
      notes: r.notes ?? null,
      branch: r.branch ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
