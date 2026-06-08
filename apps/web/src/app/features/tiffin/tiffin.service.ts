import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type TiffinMealType = 'VEG' | 'NONVEG';
export type TiffinMealPlan = 'LUNCH' | 'DINNER' | 'BOTH';
export type TiffinStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';

export interface StudentRef {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  email: string | null;
}

export interface TiffinPause {
  id: string;
  pausedAt: string;
  resumedAt: string | null;
  days: number | null;
  reason: string | null;
}

export interface TiffinSubscription {
  id: string;
  tenantId: string;
  branchId: string;
  studentId: string;
  mealType: TiffinMealType;
  mealPlan: TiffinMealPlan;
  monthlyRate: number;
  startDate: string;
  endDate: string | null;
  nextDueDate: string | null;
  status: TiffinStatus;
  deliveryAssignee: string | null;
  deliveryPhone: string | null;
  pausedDays: number;
  notes: string | null;
  student: StudentRef | null;
  branch: { id: string; name: string; code: string } | null;
  pauses: TiffinPause[];
  currentPause: TiffinPause | null;
}

export interface TiffinStats {
  total: number;
  active: number;
  paused: number;
  ended: number;
  activeRevenue: number;
}

export interface CreateTiffinSubscriptionDto {
  studentId: string;
  branchId: string;
  mealType: TiffinMealType;
  mealPlan: TiffinMealPlan;
  monthlyRate: number;
  startDate?: string;
  nextDueDate?: string;
  deliveryAssignee?: string;
  deliveryPhone?: string;
  notes?: string;
}

export interface UpdateTiffinSubscriptionDto {
  mealType?: TiffinMealType;
  mealPlan?: TiffinMealPlan;
  monthlyRate?: number;
  nextDueDate?: string;
  deliveryAssignee?: string;
  deliveryPhone?: string;
  notes?: string;
}

@Injectable({ providedIn: 'root' })
export class TiffinApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/tiffin`;

  list(opts: { studentId?: string; branchId?: string; status?: TiffinStatus } = {}) {
    let params = new HttpParams();
    if (opts.studentId) params = params.set('studentId', opts.studentId);
    if (opts.branchId)  params = params.set('branchId', opts.branchId);
    if (opts.status)    params = params.set('status', opts.status);
    return this.http.get<TiffinSubscription[]>(this.base, { params });
  }

  stats(branchId?: string) {
    let params = new HttpParams();
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<TiffinStats>(`${this.base}/stats`, { params });
  }

  get(id: string) {
    return this.http.get<TiffinSubscription>(`${this.base}/${id}`);
  }

  create(dto: CreateTiffinSubscriptionDto) {
    return this.http.post<TiffinSubscription>(this.base, dto);
  }

  update(id: string, dto: UpdateTiffinSubscriptionDto) {
    return this.http.patch<TiffinSubscription>(`${this.base}/${id}`, dto);
  }

  pause(id: string, body: { pausedAt?: string; reason?: string } = {}) {
    return this.http.post<TiffinSubscription>(`${this.base}/${id}/pause`, body);
  }

  resume(id: string, body: { resumedAt?: string } = {}) {
    return this.http.post<TiffinSubscription>(`${this.base}/${id}/resume`, body);
  }

  end(id: string) {
    return this.http.delete<TiffinSubscription>(`${this.base}/${id}`);
  }
}
