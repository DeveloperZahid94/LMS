import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface ExamTarget {
  id: string;
  tenantId: string;
  name: string;
  isCustom: boolean;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ExamTargetsApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/exam-targets`;

  list() { return this.http.get<ExamTarget[]>(this.base); }
  create(name: string) { return this.http.post<ExamTarget>(this.base, { name }); }
}
