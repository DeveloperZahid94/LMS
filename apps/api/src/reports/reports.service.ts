import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { Bucket, StudentStatusFilter } from './dto/reports.dto';

interface RawTimeseriesRow {
  bucket_start: Date;
  payment_count: number;
  total_amount: any;     // NUMERIC comes back as string from pg → cast to number
  paid_amount: any;
  pending_amount: any;
  refunded_amount: any;
  failed_amount: any;
}

interface RawStudentRow {
  student_id: string;
  code: string;
  full_name: string;
  phone: string;
  email: string | null;
  branch_id: string;
  branch_name: string | null;
  expected_amount: any;
  paid_amount: any;
  pending_amount: any;
  balance: any;
  payment_count: number;
  last_payment_at: Date | null;
  status: 'PAID' | 'PARTIAL' | 'UNPAID';
}

interface RawMethodRow {
  method: string;
  payment_count: number;
  total_amount: any;
  pct_of_total: any;
}

interface RawAgingRow {
  bucket: string;
  student_count: number;
  alloc_count: number;
  total_amount: any;
}

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
  ) {}

  async summary(opts: { dateFrom: string; dateTo: string; branchId?: string }) {
    const students = await this.studentSummary({ ...opts, status: 'ALL' });
    const totals = students.reduce(
      (acc, s) => {
        acc.expected += s.expectedAmount;
        acc.collected += s.paidAmount;
        acc.pending += s.pendingAmount;
        if (s.status === 'PAID') acc.paid += 1;
        else if (s.status === 'PARTIAL') acc.partial += 1;
        else acc.unpaid += 1;
        return acc;
      },
      { expected: 0, collected: 0, pending: 0, paid: 0, partial: 0, unpaid: 0 },
    );
    const outstanding = Math.max(0, totals.expected - totals.collected);
    const coverage = totals.expected > 0 ? (totals.collected / totals.expected) * 100 : 0;

    // Headline cash collected = ALL PAID (non-deleted) payments in the window — the same
    // basis as P&L income and Income-by-source, so the three figures tie. (Outstanding &
    // coverage above intentionally use the active-roster collected — a different question.)
    const collectedCash = await this.collectedInRange(opts);

    // Comparison: same-length window immediately prior.
    const prev = await this.previousPeriodCollections(opts);
    const deltaPct = (curr: number, prior: number): number | null => {
      if (prior === 0) return curr === 0 ? 0 : null;  // null = "—" in UI (no baseline)
      return round2(((curr - prior) / prior) * 100);
    };

    return {
      dateFrom: opts.dateFrom,
      dateTo: opts.dateTo,
      branchId: opts.branchId ?? null,
      kpis: {
        totalExpected: round2(totals.expected),
        totalCollected: round2(collectedCash),
        totalPending: round2(totals.pending),
        outstanding: round2(outstanding),
        coveragePct: round2(coverage),
        studentCount: students.length,
        paidCount: totals.paid,
        partialCount: totals.partial,
        unpaidCount: totals.unpaid,
      },
      comparison: {
        previousFrom: prev.dateFrom,
        previousTo: prev.dateTo,
        previousCollected: round2(prev.collected),
        previousTransactions: prev.transactions,
        collectedDeltaAmount: round2(collectedCash - prev.collected),
        collectedDeltaPct: deltaPct(collectedCash, prev.collected),
        transactionsDeltaPct: deltaPct(students.reduce((n, s) => n + s.paymentCount, 0), prev.transactions),
      },
      topPayers: students
        .filter((s) => s.paidAmount > 0)
        .sort((a, b) => b.paidAmount - a.paidAmount)
        .slice(0, 5)
        .map((s) => ({
          studentId: s.studentId,
          code: s.code,
          fullName: s.fullName,
          phone: s.phone,
          paidAmount: s.paidAmount,
          status: s.status,
        })),
      topOutstanding: students
        .filter((s) => s.balance > 0)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5)
        .map((s) => ({
          studentId: s.studentId,
          code: s.code,
          fullName: s.fullName,
          phone: s.phone,
          balance: s.balance,
          status: s.status,
        })),
    };
  }

  /** Sum of PAID amounts in the same-length window immediately before [dateFrom, dateTo]. */
  private async previousPeriodCollections(opts: { dateFrom: string; dateTo: string; branchId?: string }) {
    const tenantId = this.tenantCtx.tenantId;
    const from = new Date(opts.dateFrom + 'T00:00:00.000Z');
    const to   = new Date(opts.dateTo   + 'T23:59:59.999Z');
    const lengthMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 1);                            // one ms before current from
    const prevFrom = new Date(prevTo.getTime() - lengthMs);

    const where: any = {
      tenantId,
      status: 'PAID',
      deletedAt: null,
      ...(opts.branchId && { branchId: opts.branchId }),
      OR: [
        { paidAt: { gte: prevFrom, lte: prevTo } },
        { paidAt: null, createdAt: { gte: prevFrom, lte: prevTo } },
      ],
    };
    const [agg, count] = await Promise.all([
      this.prisma.payment.aggregate({ where, _sum: { amount: true } }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      dateFrom: prevFrom.toISOString().slice(0, 10),
      dateTo:   prevTo.toISOString().slice(0, 10),
      collected: Number(agg._sum.amount ?? 0),
      transactions: count,
    };
  }

  /** Total PAID (non-deleted) cash collected in [dateFrom, dateTo] — same basis as P&L. */
  private async collectedInRange(opts: { dateFrom: string; dateTo: string; branchId?: string }) {
    const tenantId = this.tenantCtx.tenantId;
    const from = new Date(opts.dateFrom + 'T00:00:00.000Z');
    const to   = new Date(opts.dateTo   + 'T23:59:59.999Z');
    const agg = await this.prisma.payment.aggregate({
      where: {
        tenantId,
        status: 'PAID',
        deletedAt: null,
        ...(opts.branchId && { branchId: opts.branchId }),
        OR: [
          { paidAt: { gte: from, lte: to } },
          { paidAt: null, createdAt: { gte: from, lte: to } },
        ],
      },
      _sum: { amount: true },
    });
    return Number(agg._sum.amount ?? 0);
  }

  async aging(opts: { branchId?: string }) {
    const tenantId = this.tenantCtx.tenantId;
    const rows = await this.prisma.$queryRaw<RawAgingRow[]>`
      SELECT * FROM fn_outstanding_aging(
        ${tenantId}::text,
        ${opts.branchId ?? null}::text
      )
    `;
    const buckets = ['CURRENT', 'D_1_30', 'D_31_60', 'D_61_90', 'D_90_PLUS'];
    const map = new Map(rows.map((r) => [r.bucket, r]));
    const out = buckets.map((b) => {
      const r = map.get(b);
      return {
        bucket: b,
        label: this.agingLabel(b),
        studentCount: r ? Number(r.student_count) : 0,
        allocCount: r ? Number(r.alloc_count) : 0,
        totalAmount: r ? Number(r.total_amount) : 0,
      };
    });
    const totalAtRisk = out.filter((b) => b.bucket !== 'CURRENT').reduce((s, b) => s + b.totalAmount, 0);
    return { buckets: out, totalAtRisk: round2(totalAtRisk) };
  }

  private agingLabel(b: string): string {
    switch (b) {
      case 'CURRENT':   return 'Current';
      case 'D_1_30':    return '1–30 days';
      case 'D_31_60':   return '31–60 days';
      case 'D_61_90':   return '61–90 days';
      case 'D_90_PLUS': return '90+ days';
      default: return b;
    }
  }

  async timeseries(opts: {
    dateFrom: string;
    dateTo: string;
    branchId?: string;
    bucket: Bucket;
  }) {
    const tenantId = this.tenantCtx.tenantId;
    const rows = await this.prisma.$queryRaw<RawTimeseriesRow[]>`
      SELECT * FROM fn_payments_timeseries(
        ${tenantId}::text,
        ${opts.branchId ?? null}::text,
        ${opts.dateFrom}::date,
        ${opts.dateTo}::date,
        ${opts.bucket}::text
      )
    `;
    return rows.map((r) => ({
      bucketStart: r.bucket_start.toISOString(),
      label: this.bucketLabel(r.bucket_start, opts.bucket),
      paymentCount: Number(r.payment_count ?? 0),
      totalAmount: Number(r.total_amount ?? 0),
      paidAmount: Number(r.paid_amount ?? 0),
      pendingAmount: Number(r.pending_amount ?? 0),
      refundedAmount: Number(r.refunded_amount ?? 0),
      failedAmount: Number(r.failed_amount ?? 0),
    }));
  }

  async studentSummary(opts: {
    dateFrom: string;
    dateTo: string;
    branchId?: string;
    status: StudentStatusFilter;
  }) {
    const tenantId = this.tenantCtx.tenantId;
    const rows = await this.prisma.$queryRaw<RawStudentRow[]>`
      SELECT * FROM fn_student_payment_summary(
        ${tenantId}::text,
        ${opts.branchId ?? null}::text,
        ${opts.dateFrom}::date,
        ${opts.dateTo}::date
      )
    `;
    const mapped = rows.map((r) => ({
      studentId: r.student_id,
      code: r.code,
      fullName: r.full_name,
      phone: r.phone,
      email: r.email,
      branchId: r.branch_id,
      branchName: r.branch_name,
      expectedAmount: Number(r.expected_amount ?? 0),
      paidAmount: Number(r.paid_amount ?? 0),
      pendingAmount: Number(r.pending_amount ?? 0),
      balance: Number(r.balance ?? 0),
      paymentCount: Number(r.payment_count ?? 0),
      lastPaymentAt: r.last_payment_at ? r.last_payment_at.toISOString() : null,
      status: r.status,
    }));
    if (opts.status === 'ALL') return mapped;
    return mapped.filter((r) => r.status === opts.status);
  }

  async methodBreakdown(opts: { dateFrom: string; dateTo: string; branchId?: string }) {
    const tenantId = this.tenantCtx.tenantId;
    const rows = await this.prisma.$queryRaw<RawMethodRow[]>`
      SELECT * FROM fn_payment_method_breakdown(
        ${tenantId}::text,
        ${opts.branchId ?? null}::text,
        ${opts.dateFrom}::date,
        ${opts.dateTo}::date
      )
    `;
    return rows.map((r) => ({
      method: r.method,
      paymentCount: Number(r.payment_count ?? 0),
      totalAmount: Number(r.total_amount ?? 0),
      pctOfTotal: Number(r.pct_of_total ?? 0),
    }));
  }

  /**
   * Profit & Loss: income (cash actually received = PAID payments) vs expenses,
   * bucketed per period, plus an expense-by-category breakdown for the range.
   */
  async profitLoss(opts: { dateFrom: string; dateTo: string; branchId?: string; bucket: Bucket }) {
    const tenantId = this.tenantCtx.tenantId;

    // Income per bucket — reuse the payments timeseries (paid_amount = cash received).
    const income = await this.timeseries(opts);

    // Expense per bucket — date_trunc on expenseDate mirrors the payments bucketing.
    const expRows = await this.prisma.$queryRaw<{ bucket_start: Date; expense_amount: any }[]>`
      SELECT date_trunc(${opts.bucket}, "expenseDate") AS bucket_start,
             SUM(amount) AS expense_amount
      FROM expenses
      WHERE "tenantId" = ${tenantId}
        AND (${opts.branchId ?? null}::text IS NULL OR "branchId" = ${opts.branchId ?? null})
        AND "expenseDate" >= ${opts.dateFrom}::date
        AND "expenseDate" < (${opts.dateTo}::date + interval '1 day')
      GROUP BY 1
      ORDER BY 1
    `;
    const expenseByLabel = new Map<string, number>();
    for (const r of expRows) {
      expenseByLabel.set(this.bucketLabel(r.bucket_start, opts.bucket), Number(r.expense_amount ?? 0));
    }

    // Union of buckets in chronological order: income series first, then expense-only buckets.
    const order: { label: string; sortKey: string }[] = [];
    const seen = new Set<string>();
    for (const p of income) {
      if (!seen.has(p.label)) { seen.add(p.label); order.push({ label: p.label, sortKey: p.bucketStart }); }
    }
    for (const r of expRows) {
      const label = this.bucketLabel(r.bucket_start, opts.bucket);
      if (!seen.has(label)) { seen.add(label); order.push({ label, sortKey: r.bucket_start.toISOString() }); }
    }
    order.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    const incomeByLabel = new Map(income.map((p) => [p.label, p.paidAmount]));
    const series = order.map((o) => {
      const inc = Number(incomeByLabel.get(o.label) ?? 0);
      const exp = Number(expenseByLabel.get(o.label) ?? 0);
      return { label: o.label, income: round2(inc), expense: round2(exp), net: round2(inc - exp) };
    });

    const totalIncome = series.reduce((s, r) => s + r.income, 0);
    const totalExpense = series.reduce((s, r) => s + r.expense, 0);
    const net = totalIncome - totalExpense;
    const marginPct = totalIncome > 0 ? (net / totalIncome) * 100 : 0;

    // Expense breakdown by category for the range.
    const grouped = await this.prisma.expense.groupBy({
      by: ['category'],
      where: {
        tenantId,
        ...(opts.branchId && { branchId: opts.branchId }),
        expenseDate: {
          gte: new Date(opts.dateFrom + 'T00:00:00.000'),
          lte: new Date(opts.dateTo + 'T23:59:59.999'),
        },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const catTotal = grouped.reduce((s, g) => s + Number(g._sum.amount ?? 0), 0);
    const byCategory = grouped
      .map((g) => ({
        category: g.category as string,
        amount: round2(Number(g._sum.amount ?? 0)),
        count: g._count._all,
        pctOfTotal: catTotal > 0 ? round2((Number(g._sum.amount ?? 0) / catTotal) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      totals: { income: round2(totalIncome), expense: round2(totalExpense), net: round2(net), marginPct: round2(marginPct) },
      series,
      byCategory,
    };
  }

  /**
   * Itemised expense report for the range: one row per expense with what was incurred
   * (amount) vs what's actually been paid (paidAmount) and the outstanding balance,
   * plus the date, branch and the staff member it's tagged to. Newest first.
   */
  async expenseDetail(opts: { dateFrom: string; dateTo: string; branchId?: string }) {
    const tenantId = this.tenantCtx.tenantId;
    const rows = await this.prisma.expense.findMany({
      where: {
        tenantId,
        ...(opts.branchId && { branchId: opts.branchId }),
        expenseDate: {
          gte: new Date(opts.dateFrom + 'T00:00:00.000'),
          lte: new Date(opts.dateTo + 'T23:59:59.999'),
        },
      },
      orderBy: { expenseDate: 'desc' },
      include: {
        branch: { select: { name: true } },
        staff: { select: { fullName: true } },
      },
    });

    const items = rows.map((r) => {
      const amount = Number(r.amount ?? 0);
      const paid = Number(r.paidAmount ?? 0);
      return {
        id: r.id,
        expenseDate: r.expenseDate.toISOString(),
        title: r.title,
        category: r.category as string,
        branchName: r.branch?.name ?? null,
        staffName: r.staff?.fullName ?? null,
        vendor: r.vendor ?? null,
        amount: round2(amount),
        paidAmount: round2(paid),
        outstanding: round2(amount - paid),
        paymentStatus: r.paymentStatus as string,
        dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      };
    });

    const totals = items.reduce(
      (a, i) => {
        a.amount += i.amount;
        a.paid += i.paidAmount;
        a.outstanding += i.outstanding;
        return a;
      },
      { amount: 0, paid: 0, outstanding: 0 },
    );

    return {
      items,
      totals: {
        amount: round2(totals.amount),
        paid: round2(totals.paid),
        outstanding: round2(totals.outstanding),
        count: items.length,
      },
    };
  }

  /**
   * Income split by business line for the range, derived from PAID payment note tags:
   *   [Cabin…] → Cabin/Seat · [PG…] → PG Rooms · [Tiffin…] → Tiffin ·
   *   [Balance…]/[Advance…] → general account settlement · anything else → Other.
   */
  async incomeBySource(opts: { dateFrom: string; dateTo: string; branchId?: string }) {
    const tenantId = this.tenantCtx.tenantId;
    const from = new Date(opts.dateFrom + 'T00:00:00.000Z');
    const to   = new Date(opts.dateTo   + 'T23:59:59.999Z');
    const where: any = {
      tenantId,
      status: 'PAID',
      deletedAt: null,
      ...(opts.branchId && { branchId: opts.branchId }),
      OR: [
        { paidAt: { gte: from, lte: to } },
        { paidAt: null, createdAt: { gte: from, lte: to } },
      ],
    };
    const rows = await this.prisma.payment.findMany({ where, select: { amount: true, notes: true } });

    const acc: Record<string, { amount: number; count: number }> = {};
    for (const r of rows) {
      const src = this.classifyIncome(r.notes);
      if (!acc[src]) acc[src] = { amount: 0, count: 0 };
      acc[src].amount += Number(r.amount ?? 0);
      acc[src].count += 1;
    }
    const total = Object.values(acc).reduce((s, v) => s + v.amount, 0);
    const order = ['CABIN', 'PG', 'TIFFIN', 'BALANCE', 'OTHER'];
    const bySource = order
      .filter((k) => acc[k])
      .map((k) => ({
        source: k,
        label: this.incomeSourceLabel(k),
        amount: round2(acc[k].amount),
        count: acc[k].count,
        pctOfTotal: total > 0 ? round2((acc[k].amount / total) * 100) : 0,
      }));
    return { bySource, total: round2(total) };
  }

  private classifyIncome(notes: string | null): string {
    const n = (notes ?? '').trim();
    if (n.startsWith('[Tiffin')) return 'TIFFIN';
    if (n.startsWith('[PG')) return 'PG';
    if (n.startsWith('[Cabin')) return 'CABIN';
    if (n.startsWith('[Balance') || n.startsWith('[Advance')) return 'BALANCE';
    return 'OTHER';
  }

  private incomeSourceLabel(k: string): string {
    switch (k) {
      case 'CABIN':   return 'Cabin / Seat';
      case 'PG':      return 'PG Rooms';
      case 'TIFFIN':  return 'Tiffin';
      case 'BALANCE': return 'Account / Balance';
      default:        return 'Other / Untagged';
    }
  }

  private bucketLabel(d: Date, bucket: Bucket): string {
    const date = new Date(d);
    if (bucket === 'day')  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    if (bucket === 'week') return 'Wk ' + this.isoWeek(date);
    if (bucket === 'month') return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    return String(date.getFullYear());
  }

  private isoWeek(d: Date): number {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
