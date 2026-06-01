import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Branch { id: string; name: string; code: string; }

@Injectable({ providedIn: 'root' })
export class BranchesApiService {
  private http = inject(HttpClient);
  list() {
    return this.http.get<Branch[]>(`${environment.apiUrl}/branches`);
  }
}
