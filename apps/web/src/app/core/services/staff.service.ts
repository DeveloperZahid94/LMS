import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type StaffRole = 'CLIENT_ADMIN' | 'BRANCH_ADMIN' | 'STAFF';

export interface Staff {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  isActive: boolean;
  branchId: string | null;
  branch: { id: string; name: string; code: string } | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CreateStaffDto {
  fullName: string;
  email: string;
  password: string;
  role: 'BRANCH_ADMIN' | 'STAFF';
  phone?: string;
  branchId?: string;
}

export interface UpdateStaffDto {
  fullName?: string;
  role?: 'BRANCH_ADMIN' | 'STAFF';
  isActive?: boolean;
  phone?: string;
  branchId?: string;
  password?: string;
}

@Injectable({ providedIn: 'root' })
export class StaffApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/staff`;

  /** All staff, or only active ones (for dropdowns) when activeOnly = true. */
  list(activeOnly = false) {
    let params = new HttpParams();
    if (activeOnly) params = params.set('activeOnly', 'true');
    return this.http.get<Staff[]>(this.base, { params });
  }

  create(dto: CreateStaffDto) {
    return this.http.post<Staff>(this.base, dto);
  }

  update(id: string, dto: UpdateStaffDto) {
    return this.http.patch<Staff>(`${this.base}/${id}`, dto);
  }
}
