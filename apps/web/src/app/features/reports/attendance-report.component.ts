import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { BranchesApiService, Branch } from '../students/branches.service';
import { ToastService } from '../../core/services/toast.service';
import { ExportColumn, exportCsv, exportPdf, fmtDate, fmtDateTime } from '../../shared/utils/export.util';

interface AttRow {
  id: string;
  date: string;
  checkInAt: string;
  checkOutAt: string | null;
  source: string;
  student: { code: string; fullName: string; phone: string };
  branch: { name: string } | null;
}

@Component({
  selector: 'lms-attendance-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="mb-4 flex items-end justify-between flex-wrap gap-2">
      <div>
        <a routerLink="/reports" class="link link-hover text-sm opacity-70">← Reports</a>
        <h1 class="text-2xl font-bold">Attendance Report</h1>
        <p class="text-sm opacity-60">Check-ins over a date range, with branch &amp; source filters.</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="card bg-base-100 border border-base-300 shadow-sm mb-3">
      <div class="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <label class="form-control">
          <div class="label py-1"><span class="label-text">From</span></div>
          <input class="input input-bordered input-sm" type="date" [(ngModel)]="from" />
        </label>
        <label class="form-control">
          <div class="label py-1"><span class="label-text">To</span></div>
          <input class="input input-bordered input-sm" type="date" [(ngModel)]="to" />
        </label>
        <label class="form-control">
          <div class="label py-1"><span class="label-text">Branch</span></div>
          <select class="select select-bordered select-sm" [(ngModel)]="branchId">
            <option [ngValue]="''">All branches</option>
            <option *ngFor="let b of branches()" [value]="b.id">{{ b.name }}</option>
          </select>
        </label>
        <label class="form-control">
          <div class="label py-1"><span class="label-text">Source</span></div>
          <select class="select select-bordered select-sm" [(ngModel)]="source">
            <option [ngValue]="''">All</option>
            <option value="SELF">Self (kiosk)</option>
            <option value="QR">QR</option>
            <option value="MANUAL">Manual</option>
            <option value="BIOMETRIC">Biometric</option>
          </select>
        </label>
        <button class="btn btn-primary btn-sm" (click)="run()" [disabled]="loading()">
          <span *ngIf="loading()" class="loading loading-spinner loading-xs"></span> Run report
        </button>
      </div>
    </div>

    <!-- Summary + export -->
    <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
      <div class="text-sm opacity-70" *ngIf="rows().length > 0">
        {{ rows().length }} check-in{{ rows().length === 1 ? '' : 's' }} ·
        {{ uniqueStudents() }} student{{ uniqueStudents() === 1 ? '' : 's' }} ·
        {{ checkedOut() }} checked out
      </div>
      <div class="flex gap-2 ml-auto">
        <button class="btn btn-sm btn-outline" (click)="export('csv')" [disabled]="rows().length === 0">⬇ CSV</button>
        <button class="btn btn-sm btn-outline" (click)="export('pdf')" [disabled]="rows().length === 0">⬇ PDF</button>
      </div>
    </div>

    <div *ngIf="loading()" class="text-center py-10"><span class="loading loading-spinner loading-md"></span></div>

    <div *ngIf="!loading()" class="card bg-base-100 border border-base-300 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="table table-sm table-zebra">
          <thead class="bg-base-200">
            <tr><th>Date</th><th>Student</th><th>Phone</th><th>Branch</th><th>Check-in</th><th>Check-out</th><th>Source</th></tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of rows()" class="hover">
              <td class="text-xs whitespace-nowrap">{{ r.date | date:'dd MMM yy' }}</td>
              <td><code class="text-xs bg-base-200 px-1 rounded">{{ r.student.code }}</code> {{ r.student.fullName }}</td>
              <td class="text-xs">{{ r.student.phone }}</td>
              <td class="text-xs">{{ r.branch?.name || '—' }}</td>
              <td class="text-xs">{{ r.checkInAt | date:'shortTime' }}</td>
              <td class="text-xs">{{ r.checkOutAt ? (r.checkOutAt | date:'shortTime') : '—' }}</td>
              <td><span class="badge badge-ghost badge-sm">{{ r.source }}</span></td>
            </tr>
            <tr *ngIf="rows().length === 0">
              <td colspan="7" class="text-center opacity-60 py-8">No attendance for the selected filters. Set a range and click Run report.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class AttendanceReportComponent implements OnInit {
  private http = inject(HttpClient);
  private branchesApi = inject(BranchesApiService);
  private toast = inject(ToastService);

  from = '';
  to = '';
  branchId = '';
  source = '';
  branches = signal<Branch[]>([]);
  rows = signal<AttRow[]>([]);
  loading = signal(false);

  uniqueStudents = computed(() => new Set(this.rows().map((r) => r.student.code)).size);
  checkedOut = computed(() => this.rows().filter((r) => !!r.checkOutAt).length);

  ngOnInit() {
    const today = new Date();
    const past = new Date(); past.setDate(today.getDate() - 29);
    this.from = past.toISOString().slice(0, 10);
    this.to = today.toISOString().slice(0, 10);
    this.branchesApi.list().subscribe((bs) => this.branches.set(bs));
    this.run();
  }

  run() {
    this.loading.set(true);
    let params = new HttpParams();
    if (this.from) params = params.set('from', this.from);
    if (this.to) params = params.set('to', this.to);
    if (this.branchId) params = params.set('branchId', this.branchId);
    if (this.source) params = params.set('source', this.source);
    this.http.get<AttRow[]>(`${environment.apiUrl}/attendance/report`, { params }).subscribe({
      next: (rs) => { this.rows.set(rs); this.loading.set(false); },
      error: () => { this.toast.error('Could not load the attendance report'); this.loading.set(false); },
    });
  }

  export(kind: 'csv' | 'pdf') {
    if (this.rows().length === 0) return;
    const cols: ExportColumn<AttRow>[] = [
      { header: 'Date', value: (r) => fmtDate(r.date) },
      { header: 'Code', value: (r) => r.student.code },
      { header: 'Student', value: (r) => r.student.fullName },
      { header: 'Phone', value: (r) => r.student.phone },
      { header: 'Branch', value: (r) => r.branch?.name ?? '' },
      { header: 'Check-in', value: (r) => fmtDateTime(r.checkInAt) },
      { header: 'Check-out', value: (r) => (r.checkOutAt ? fmtDateTime(r.checkOutAt) : '') },
      { header: 'Source', value: (r) => r.source },
    ];
    const subtitle = `Attendance ${fmtDate(this.from)} – ${fmtDate(this.to)} · ${this.rows().length} records`;
    const meta = { title: 'Attendance report', subtitle, fileSlug: 'attendance' };
    if (kind === 'csv') exportCsv(this.rows(), cols, meta);
    else exportPdf(this.rows(), cols, meta);
    this.toast.success(`Exported ${this.rows().length} records as ${kind.toUpperCase()}`);
  }
}
