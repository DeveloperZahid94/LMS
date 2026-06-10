import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type PgRoomType = 'SINGLE' | 'DOUBLE' | 'TRIPLE';
export type BedStatus  = 'AVAILABLE' | 'OCCUPIED';
export type Availability = 'ALL' | 'AVAILABLE' | 'PARTIAL' | 'FULL';

export interface StudentRef {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  email: string | null;
}

export interface BedAssignment {
  id: string;
  startDate: string;
  nextDueDate: string | null;
  monthlyRate: number | null;
  student: StudentRef;
}

export interface RoomBed {
  bedNumber: number;
  status: BedStatus;
  assignment: BedAssignment | null;
}

export interface PgRoom {
  id: string;
  tenantId: string;
  branchId: string;
  roomNumber: string;
  type: PgRoomType;
  bedCount: number;
  monthlyRate: number;
  floor: string | null;
  amenities: string[];
  notes: string | null;
  isActive: boolean;
  beds: RoomBed[];
  occupiedBeds: number;
  availableBeds: number;
  historyCount: number;
}

export interface PgRoomStats {
  totalRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  singleRooms: number;
  doubleRooms: number;
  tripleRooms: number;
}

export interface CreatePgRoomDto {
  branchId: string;
  roomNumber: string;
  type: PgRoomType;
  bedCount?: number;
  monthlyRate: number;
  floor?: string;
  notes?: string;
  amenities?: string[];
}

export interface AssignBedDto {
  studentId: string;
  bedNumber: number;
  monthlyRate?: number;
  startDate?: string;
  nextDueDate?: string;
  notes?: string;
  /** Staff member who handled this allocation. Defaults to the logged-in user. */
  assignedById?: string;
}

export interface PgRoomHistoryRow {
  id: string;
  bedNumber: number;
  startDate: string;
  endDate: string | null;
  monthlyRate: number | null;
  nextDueDate: string | null;
  status: 'ACTIVE' | 'ENDED';
  notes: string | null;
  student: { id: string; code: string; fullName: string; phone: string };
}

@Injectable({ providedIn: 'root' })
export class PgRoomsApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/pg-rooms`;

  list(opts: { branchId?: string; type?: PgRoomType; availability?: Availability; search?: string } = {}) {
    let params = new HttpParams();
    if (opts.branchId)     params = params.set('branchId', opts.branchId);
    if (opts.type)         params = params.set('type', opts.type);
    if (opts.availability) params = params.set('availability', opts.availability);
    if (opts.search)       params = params.set('search', opts.search);
    return this.http.get<PgRoom[]>(this.base, { params });
  }

  stats(branchId?: string) {
    let params = new HttpParams();
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<PgRoomStats>(`${this.base}/stats`, { params });
  }

  create(dto: CreatePgRoomDto) {
    return this.http.post<PgRoom>(this.base, dto);
  }

  remove(id: string) {
    return this.http.delete<{ id: string; deleted: boolean }>(`${this.base}/${id}`);
  }

  assign(roomId: string, dto: AssignBedDto) {
    return this.http.post<BedAssignment>(`${this.base}/${roomId}/assignments`, dto);
  }

  unassign(assignmentId: string) {
    return this.http.delete<BedAssignment>(`${this.base}/assignments/${assignmentId}`);
  }

  history(roomId: string) {
    return this.http.get<PgRoomHistoryRow[]>(`${this.base}/${roomId}/history`);
  }
}
