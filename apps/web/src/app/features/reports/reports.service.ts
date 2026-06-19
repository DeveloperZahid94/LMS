import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type Bucket = 'day' | 'week' | 'month' | 'year';
export type StudentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';
export type StudentStatusFilter = 'ALL' | StudentStatus;

export interface ReportsSummary {
  dateFrom: string;
  dateTo: string;
  branchId: string | null;
  kpis: {
    totalExpected: number;
    totalCollected: number;
    totalPending: number;
    outstanding: number;
    coveragePct: number;
    studentCount: number;
    paidCount: number;
    partialCount: number;
    unpaidCount: number;
  };
  comparison: {
    previousFrom: string;
    previousTo: string;
    previousCollected: number;
    previousTransactions: number;
    collectedDeltaAmount: number;
    collectedDeltaPct: number | null;
    transactionsDeltaPct: number | null;
  };
  topPayers: {
    studentId: string;
    code: string;
    fullName: string;
    phone: string;
    paidAmount: number;
    status: StudentStatus;
  }[];
  topOutstanding: {
    studentId: string;
    code: string;
    fullName: string;
    phone: string;
    balance: number;
    status: StudentStatus;
  }[];
}

export type AgingBucketKey = 'CURRENT' | 'D_1_30' | 'D_31_60' | 'D_61_90' | 'D_90_PLUS';

export interface AgingBucket {
  bucket: AgingBucketKey;
  label: string;
  studentCount: number;
  allocCount: number;
  totalAmount: number;
}

export interface AgingResponse {
  buckets: AgingBucket[];
  totalAtRisk: number;
}

export interface TimeseriesPoint {
  bucketStart: string;
  label: string;
  paymentCount: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  refundedAmount: number;
  failedAmount: number;
}

export interface StudentSummaryRow {
  studentId: string;
  code: string;
  fullName: string;
  phone: string;
  email: string | null;
  branchId: string;
  branchName: string | null;
  expectedAmount: number;
  paidAmount: number;
  pendingAmount: number;
  balance: number;
  paymentCount: number;
  lastPaymentAt: string | null;
  status: StudentStatus;
}

export interface MethodBreakdownRow {
  method: string;
  paymentCount: number;
  totalAmount: number;
  pctOfTotal: number;
}

export interface PlSeriesPoint {
  label: string;
  income: number;
  expense: number;
  net: number;
}

export interface ExpenseCategoryRow {
  category: string;
  amount: number;
  count: number;
  pctOfTotal: number;
}

export interface ProfitLoss {
  totals: { income: number; expense: number; net: number; marginPct: number };
  series: PlSeriesPoint[];
  byCategory: ExpenseCategoryRow[];
}

export interface ExpensePaymentRow {
  id: string;
  amount: number;
  paymentMethod: string | null;
  notes: string | null;
  paidDate: string;
}

export interface ExpenseDetailRow {
  id: string;
  expenseDate: string;
  title: string;
  category: string;
  branchName: string | null;
  staffName: string | null;
  vendor: string | null;
  amount: number;
  paidAmount: number;
  outstanding: number;
  paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
  dueDate: string | null;
  payments: ExpensePaymentRow[];
}

export interface ExpenseDetail {
  items: ExpenseDetailRow[];
  totals: { amount: number; paid: number; outstanding: number; count: number };
}

export interface IncomeSourceRow {
  source: string;
  label: string;
  amount: number;
  count: number;
  pctOfTotal: number;
}

export interface IncomeBySource {
  bySource: IncomeSourceRow[];
  total: number;
}

export interface RangeOpts {
  dateFrom: string;
  dateTo: string;
  branchId?: string;
}

@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/reports`;

  summary(opts: RangeOpts) {
    return this.http.get<ReportsSummary>(`${this.base}/summary`, { params: this.params(opts) });
  }

  timeseries(opts: RangeOpts & { bucket: Bucket }) {
    return this.http.get<TimeseriesPoint[]>(`${this.base}/timeseries`, {
      params: this.params(opts).set('bucket', opts.bucket),
    });
  }

  students(opts: RangeOpts & { status?: StudentStatusFilter }) {
    let p = this.params(opts);
    if (opts.status) p = p.set('status', opts.status);
    return this.http.get<StudentSummaryRow[]>(`${this.base}/students`, { params: p });
  }

  methods(opts: RangeOpts) {
    return this.http.get<MethodBreakdownRow[]>(`${this.base}/methods`, { params: this.params(opts) });
  }

  aging(branchId?: string) {
    let p = new HttpParams();
    if (branchId) p = p.set('branchId', branchId);
    return this.http.get<AgingResponse>(`${this.base}/aging`, { params: p });
  }

  profitLoss(opts: RangeOpts & { bucket: Bucket }) {
    return this.http.get<ProfitLoss>(`${this.base}/profit-loss`, {
      params: this.params(opts).set('bucket', opts.bucket),
    });
  }

  incomeBySource(opts: RangeOpts) {
    return this.http.get<IncomeBySource>(`${this.base}/income-sources`, { params: this.params(opts) });
  }

  expenseDetail(opts: RangeOpts) {
    return this.http.get<ExpenseDetail>(`${this.base}/expense-detail`, { params: this.params(opts) });
  }

  private params(opts: RangeOpts): HttpParams {
    let p = new HttpParams()
      .set('dateFrom', opts.dateFrom)
      .set('dateTo', opts.dateTo);
    if (opts.branchId) p = p.set('branchId', opts.branchId);
    return p;
  }
}
