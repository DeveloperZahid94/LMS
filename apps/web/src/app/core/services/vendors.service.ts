import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Vendor {
  id: string;
  tenantId: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  gstNumber: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  advanceBalance: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVendorDto {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  gstNumber?: string;
  address?: string;
  notes?: string;
  isActive?: boolean;
}

export type UpdateVendorDto = Partial<CreateVendorDto>;

@Injectable({ providedIn: 'root' })
export class VendorsApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/vendors`;

  list(activeOnly = false) {
    let params = new HttpParams();
    if (activeOnly) params = params.set('activeOnly', 'true');
    return this.http.get<Vendor[]>(this.base, { params });
  }

  create(dto: CreateVendorDto) { return this.http.post<Vendor>(this.base, dto); }
  update(id: string, dto: UpdateVendorDto) { return this.http.patch<Vendor>(`${this.base}/${id}`, dto); }
  remove(id: string) { return this.http.delete<{ id: string; deleted: boolean }>(`${this.base}/${id}`); }

  /** Top up a vendor's advance wallet (drawn down by future expenses). */
  recordAdvance(id: string, body: { amount: number; notes?: string }) {
    return this.http.post<Vendor>(`${this.base}/${id}/advance`, body);
  }
}
