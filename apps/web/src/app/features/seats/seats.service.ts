import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  CreateSeatDto, CreateSeatAssignmentDto, PaginatedResponse, Seat, SeatAssignment,
  SeatAssignmentStatus,
} from '@lms/shared';

export interface SeatWithAssignments extends Seat {
  assignments: Array<{
    id: string;
    shift: string;
    studentId: string;
    status: SeatAssignmentStatus;
    nextDueDate: string | null;
    student: { id: string; code: string; fullName: string };
  }>;
}

@Injectable({ providedIn: 'root' })
export class SeatsApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/seats`;

  list(branchId?: string) {
    let params = new HttpParams();
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<SeatWithAssignments[]>(this.base, { params });
  }

  create(dto: CreateSeatDto) { return this.http.post<Seat>(this.base, dto); }
  update(id: string, dto: Partial<CreateSeatDto>) { return this.http.patch<Seat>(`${this.base}/${id}`, dto); }
  remove(id: string) { return this.http.delete(`${this.base}/${id}`); }
}

export interface AllocationsQuery {
  branchId?: string;
  search?: string;
  status?: 'TEMPORARY' | 'CONFIRMED' | 'ENDED' | 'ACTIVE' | 'ALL';
  page?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class SeatAssignmentsApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/seat-assignments`;

  list(opts: AllocationsQuery = {}) {
    let params = new HttpParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<PaginatedResponse<SeatAssignment>>(this.base, { params });
  }

  create(dto: CreateSeatAssignmentDto) { return this.http.post<SeatAssignment>(this.base, dto); }
  end(id: string) { return this.http.delete(`${this.base}/${id}`); }
}
