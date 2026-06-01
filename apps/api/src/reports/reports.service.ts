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
        totalCollected: round2(totals.collected),
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
        collectedDeltaAmount: round2(totals.collected - prev.collected),
        collectedDeltaPct: deltaPct(totals.collected, prev.collected),
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
