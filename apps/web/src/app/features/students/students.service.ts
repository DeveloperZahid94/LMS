import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  CreateStudentDto, PaginatedResponse, Student, UpdateStudentDto,
} from '@lms/shared';

export interface ActiveSeatInfo {
  id: string;
  seatCode: string;
  seatType: string;
  shift: string;
  monthlyRate: number | null;
  nextDueDate: string | null;
  status: 'TEMPORARY' | 'CONFIRMED';
}

export type StudentRow = Student & { activeSeat: ActiveSeatInfo | null };

export interface ListStudentsQuery {
  page?: number;
  limit?: number;
  search?: string;
  branchId?: string;
  status?: string;
  sortBy?: 'code' | 'fullName' | 'phone' | 'status' | 'joinedAt' | 'expiresAt' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  /** Exclude students already holding an active (TEMPORARY/CONFIRMED) seat allocation. */
  notAllocated?: boolean;
  /** Lower bound (inclusive) for registration/joined date — yyyy-mm-dd. */
  dateFrom?: string;
  /** Upper bound (inclusive) for registration/joined date — yyyy-mm-dd. */
  dateTo?: string;
}

@Injectable({ providedIn: 'root' })
export class StudentsApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/students`;

  list(query: ListStudentsQuery = {}) {
    let params = new HttpParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<PaginatedResponse<StudentRow>>(this.base, { params });
  }

  get(id: string) { return this.http.get<Student>(`${this.base}/${id}`); }
  create(dto: CreateStudentDto) { return this.http.post<Student>(this.base, dto); }
  update(id: string, dto: UpdateStudentDto) { return this.http.patch<Student>(`${this.base}/${id}`, dto); }
  remove(id: string) { return this.http.delete(`${this.base}/${id}`); }
}
