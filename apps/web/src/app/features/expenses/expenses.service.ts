import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type ExpenseCategory =
  | 'RENT' | 'SALARY' | 'ELECTRICITY' | 'WATER' | 'INTERNET'
  | 'MAINTENANCE' | 'SUPPLIES' | 'EQUIPMENT' | 'MARKETING' | 'MISC';

export type ExpensePaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export interface Expense {
  id: string;
  tenantId: string;
  branchId: string | null;
  category: ExpenseCategory;
  title: string;
  amount: number;
  expenseDate: string;
  paymentMethod: string | null;
  vendor: string | null;
  staffId: string | null;
  staff: { id: string; fullName: string; role: string } | null;
  notes: string | null;
  branch: { id: string; name: string; code: string } | null;
  paymentStatus: ExpensePaymentStatus;
  paidAmount: number;
  outstanding: number;
  dueDate: string | null;
  paidDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseStats {
  total: number;
  totalAmount: number;
  thisMonthAmount: number;
  thisMonthCount: number;
  outstandingAmount: number;
  outstandingCount: number;
  topCategory: { category: ExpenseCategory; amount: number } | null;
  categories: { category: ExpenseCategory; amount: number }[];
}

export interface CreateExpenseDto {
  title: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate?: string;
  branchId?: string;
  paymentMethod?: string;
  vendor?: string;
  staffId?: string;
  notes?: string;
  onCredit?: boolean;
  paidAmount?: number;
  dueDate?: string;
}

export type UpdateExpenseDto = Partial<CreateExpenseDto>;

export interface PayExpenseDto {
  amount: number;
  paymentMethod?: string;
  paidDate?: string;
}

@Injectable({ providedIn: 'root' })
export class ExpensesApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/expenses`;

  list(opts: { branchId?: string; staffId?: string; category?: ExpenseCategory; paymentStatus?: ExpensePaymentStatus; from?: string; to?: string } = {}) {
    let params = new HttpParams();
    if (opts.branchId) params = params.set('branchId', opts.branchId);
    if (opts.staffId)  params = params.set('staffId', opts.staffId);
    if (opts.category) params = params.set('category', opts.category);
    if (opts.paymentStatus) params = params.set('paymentStatus', opts.paymentStatus);
    if (opts.from)     params = params.set('from', opts.from);
    if (opts.to)       params = params.set('to', opts.to);
    return this.http.get<Expense[]>(this.base, { params });
  }

  stats(branchId?: string) {
    let params = new HttpParams();
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<ExpenseStats>(`${this.base}/stats`, { params });
  }

  get(id: string) {
    return this.http.get<Expense>(`${this.base}/${id}`);
  }

  create(dto: CreateExpenseDto) {
    return this.http.post<Expense>(this.base, dto);
  }

  update(id: string, dto: UpdateExpenseDto) {
    return this.http.patch<Expense>(`${this.base}/${id}`, dto);
  }

  pay(id: string, dto: PayExpenseDto) {
    return this.http.post<Expense>(`${this.base}/${id}/pay`, dto);
  }

  remove(id: string) {
    return this.http.delete<{ id: string; deleted: boolean }>(`${this.base}/${id}`);
  }
}
