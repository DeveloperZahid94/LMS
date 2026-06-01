import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { DashboardSummary } from '@lms/shared';

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private http = inject(HttpClient);
  summary(branchId?: string) {
    const url = branchId
      ? `${environment.apiUrl}/dashboard/summary?branchId=${branchId}`
      : `${environment.apiUrl}/dashboard/summary`;
    return this.http.get<DashboardSummary>(url);
  }
}
