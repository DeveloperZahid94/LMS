import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, Subject } from 'rxjs';
import { AuditLogRow } from '@lms/shared';
import { AuditApiService, TenantAuditQuery } from './audit.service';
import { ToastService } from '../../core/services/toast.service';

/**
 * Tenant-facing audit log: every mutating action taken in this organisation,
 * with who/what/when. Server scopes strictly to the caller's tenant.
 */
@Component({
  selector: 'lms-tenant-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="flex items-start justify-between gap-3 mb-4 flex-wrap">
      <div>
        <div class="text-sm breadcrumbs opacity-60 p-0">
          <ul><li><a routerLink="/settings" [queryParams]="{ section: 'security' }">Settings</a></li><li>Audit Log</li></ul>
        </div>
        <h1 class="text-2xl font-bold">Audit Log</h1>
        <p class="text-sm opacity-60 mt-1">Every change made in your organisation — who did what, and when.</p>
      </div>
      <button class="btn btn-outline btn-sm gap-2" (click)="exportCsv()" [disabled]="exporting()">
        <span *ngIf="exporting()" class="loading loading-spinner loading-xs"></span>
        Export CSV
      </button>
    </div>

    <!-- Filters -->
    <div class="card bg-base-100 border border-base-300 shadow-sm mb-3">
      <div class="p-2 flex flex-row flex-wrap items-center gap-2">
        <label class="input input-bordered input-sm flex items-center gap-2 flex-1 min-w-[220px]">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input class="grow" [(ngModel)]="search" (ngModelChange)="onFilter()" placeholder="Search path, action, IP…" />
          <button *ngIf="search" class="opacity-60 hover:opacity-100 px-1" (click)="search=''; onFilter()">✕</button>
        </label>
        <select class="select select-bordered select-sm" [(ngModel)]="method" (ngModelChange)="onFilter()">
          <option value="">All actions</option>
          <option value="POST">Created (POST)</option>
          <option value="PUT">Updated (PUT)</option>
          <option value="PATCH">Updated (PATCH)</option>
          <option value="DELETE">Deleted (DELETE)</option>
        </select>
        <input class="input input-bordered input-sm" type="date" [(ngModel)]="dateFrom" (ngModelChange)="onFilter()" title="From" />
        <input class="input input-bordered input-sm" type="date" [(ngModel)]="dateTo" (ngModelChange)="onFilter()" title="To" />
      </div>
    </div>

    <div *ngIf="loading()" class="text-center py-10"><span class="loading loading-spinner loading-md"></span></div>

    <div *ngIf="!loading()" class="card bg-base-100 border border-base-300 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead class="bg-base-200">
            <tr class="text-xs uppercase tracking-wider">
              <th>Time</th><th>Who</th><th>Action</th><th>Path</th><th>Status</th><th>Duration</th><th>IP</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of rows()" class="hover">
              <td class="text-xs whitespace-nowrap">{{ r.createdAt | date:'dd MMM HH:mm:ss' }}</td>
              <td class="text-xs">
                <div>{{ r.user?.fullName ?? '—' }}</div>
                <div class="opacity-60">{{ r.user?.email }}</div>
              </td>
              <td><span class="badge badge-sm" [class]="methodClass(r.method)">{{ r.action }}</span></td>
              <td class="text-xs font-mono max-w-[260px] truncate" [title]="r.path ?? ''">{{ r.path ?? r.entity }}</td>
              <td>
                <span class="badge badge-sm" *ngIf="r.statusCode"
                  [class.badge-success]="r.statusCode < 400"
                  [class.badge-warning]="r.statusCode >= 400 && r.statusCode < 500"
                  [class.badge-error]="r.statusCode >= 500">{{ r.statusCode }}</span>
              </td>
              <td class="text-xs">{{ r.durationMs != null ? r.durationMs + 'ms' : '—' }}</td>
              <td class="text-xs opacity-60">{{ r.ip ?? '—' }}</td>
            </tr>
            <tr *ngIf="rows().length === 0">
              <td colspan="7" class="text-center opacity-60 py-10">No activity matches your filters yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pagination -->
    <div class="flex items-center justify-between mt-4 text-sm flex-wrap gap-2" *ngIf="total() > 0">
      <div class="opacity-60">
        Showing {{ (page() - 1) * limit + 1 }}–{{ rangeEnd() }} of {{ total() }} entries
      </div>
      <div class="join">
        <button class="btn btn-sm join-item" (click)="goTo(page() - 1)" [disabled]="page() === 1">Previous</button>
        <button class="btn btn-sm join-item btn-active">{{ page() }} / {{ totalPages() }}</button>
        <button class="btn btn-sm join-item" (click)="goTo(page() + 1)" [disabled]="page() >= totalPages()">Next</button>
      </div>
    </div>
  `,
})
export class TenantAuditLogComponent implements OnInit {
  private api = inject(AuditApiService);
  private toast = inject(ToastService);

  rows = signal<AuditLogRow[]>([]);
  total = signal(0);
  page = signal(1);
  limit = 50;
  loading = signal(false);
  exporting = signal(false);

  search = '';
  method = '';
  dateFrom = '';
  dateTo = '';

  private filter$ = new Subject<void>();

  ngOnInit() {
    this.filter$.pipe(debounceTime(250)).subscribe(() => { this.page.set(1); this.reload(); });
    this.reload();
  }

  onFilter() { this.filter$.next(); }

  private query(): TenantAuditQuery {
    return {
      search: this.search || undefined,
      method: this.method || undefined,
      dateFrom: this.dateFrom || undefined,
      dateTo: this.dateTo || undefined,
    };
  }

  reload() {
    this.loading.set(true);
    this.api.list({ ...this.query(), page: this.page(), limit: this.limit }).subscribe({
      next: (res) => { this.rows.set(res.data); this.total.set(res.total); this.loading.set(false); },
      error: () => { this.toast.error('Could not load audit logs'); this.loading.set(false); },
    });
  }

  exportCsv() {
    this.exporting.set(true);
    this.api.exportCsv(this.query()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: () => { this.toast.error('Export failed'); this.exporting.set(false); },
    });
  }

  goTo(p: number) {
    if (p < 1 || p > this.totalPages() || p === this.page()) return;
    this.page.set(p);
    this.reload();
  }
  totalPages(): number { return Math.max(1, Math.ceil(this.total() / this.limit)); }
  rangeEnd(): number { return Math.min(this.page() * this.limit, this.total()); }

  methodClass(method: string | null): string {
    switch (method) {
      case 'POST': return 'badge-success';
      case 'PUT':
      case 'PATCH': return 'badge-info';
      case 'DELETE': return 'badge-error';
      default: return 'badge-ghost';
    }
  }
}
