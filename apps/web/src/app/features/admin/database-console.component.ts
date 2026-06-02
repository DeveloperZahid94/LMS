import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DbQueryResult, DbStats } from '@lms/shared';
import { AdminApiService } from './admin.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'lms-database-console',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="mb-4">
      <h1 class="text-2xl font-bold">Database</h1>
      <p class="text-sm opacity-60 mt-1">Monitoring & query console — SuperAdmin only</p>
    </div>

    <!-- Monitoring -->
    <div *ngIf="stats() as s" class="mb-4">
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-3">
        <div class="card bg-base-100 border border-base-300 p-3">
          <div class="text-[10px] uppercase tracking-wider opacity-60">DB Size</div>
          <div class="text-lg font-bold">{{ s.databaseSize }}</div>
        </div>
        <div class="card bg-base-100 border border-base-300 p-3">
          <div class="text-[10px] uppercase tracking-wider opacity-60">Connections</div>
          <div class="text-lg font-bold">{{ s.activeConnections }}</div>
        </div>
        <div class="card bg-base-100 border border-base-300 p-3">
          <div class="text-[10px] uppercase tracking-wider opacity-60">Tenants</div>
          <div class="text-lg font-bold">{{ s.totals.tenants }}</div>
        </div>
        <div class="card bg-base-100 border border-base-300 p-3">
          <div class="text-[10px] uppercase tracking-wider opacity-60">Users</div>
          <div class="text-lg font-bold">{{ s.totals.users }}</div>
        </div>
        <div class="card bg-base-100 border border-base-300 p-3">
          <div class="text-[10px] uppercase tracking-wider opacity-60">Students</div>
          <div class="text-lg font-bold">{{ s.totals.students }}</div>
        </div>
        <div class="card bg-base-100 border border-base-300 p-3">
          <div class="text-[10px] uppercase tracking-wider opacity-60">Payments</div>
          <div class="text-lg font-bold">{{ s.totals.payments }}</div>
        </div>
      </div>
      <div class="collapse collapse-arrow bg-base-100 border border-base-300">
        <input type="checkbox" />
        <div class="collapse-title text-sm font-medium">Table row counts ({{ s.tables.length }})</div>
        <div class="collapse-content">
          <div class="flex flex-wrap gap-2">
            <span *ngFor="let t of s.tables" class="badge badge-outline gap-1">
              {{ t.table }} <span class="opacity-60">{{ t.rows }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- SQL editor -->
    <div class="card bg-base-100 border border-base-300 shadow-sm mb-3">
      <div class="card-body p-3 gap-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">SQL Console</span>
          <span class="text-xs opacity-60">Reads auto-limited to 1000 rows · writes need confirmation</span>
        </div>
        <textarea class="textarea textarea-bordered font-mono text-sm h-32" [(ngModel)]="sql"
                  placeholder="SELECT * FROM tenants;" (keydown.control.enter)="run(false)"></textarea>
        <div class="flex items-center gap-2">
          <button class="btn btn-primary btn-sm" (click)="run(false)" [disabled]="running() || !sql.trim()">
            <span *ngIf="running()" class="loading loading-spinner loading-xs"></span>
            Run (Ctrl+Enter)
          </button>
          <span class="text-xs text-warning" *ngIf="warn()">⚠ Read/write console — changes are permanent and audited.</span>
        </div>
      </div>
    </div>

    <!-- Result -->
    <div *ngIf="result() as r" class="card bg-base-100 border border-base-300 shadow-sm overflow-hidden">
      <div class="px-3 py-2 border-b border-base-300 text-xs flex items-center gap-3">
        <span class="badge badge-sm" [class.badge-info]="r.kind === 'read'" [class.badge-warning]="r.kind === 'write'">{{ r.kind }}</span>
        <span>{{ r.rowCount }} row{{ r.rowCount === 1 ? '' : 's' }}</span>
        <span class="opacity-60">{{ r.durationMs }}ms</span>
      </div>
      <div class="overflow-x-auto max-h-[480px]">
        <table class="table table-sm table-pin-rows">
          <thead><tr><th *ngFor="let c of r.columns">{{ c }}</th></tr></thead>
          <tbody>
            <tr *ngFor="let row of r.rows" class="hover">
              <td *ngFor="let c of r.columns" class="font-mono text-xs">{{ format(row[c]) }}</td>
            </tr>
            <tr *ngIf="r.rows.length === 0"><td [attr.colspan]="r.columns.length || 1" class="text-center opacity-60 py-6">No rows.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Write confirmation -->
    <dialog class="modal" [class.modal-open]="confirmOpen()">
      <div class="modal-box">
        <h3 class="font-bold text-lg" [class.text-error]="destructive()" [class.text-warning]="!destructive()">
          {{ destructive() ? 'Destructive operation' : 'Confirm write' }}
        </h3>

        <div *ngIf="destructive()" class="alert alert-error mt-2 py-2 text-sm">
          <span>⚠ This {{ destructiveVerb() }} statement permanently removes data and cannot be undone.</span>
        </div>
        <p *ngIf="!destructive()" class="py-2 text-sm">This statement modifies the database and cannot be undone.</p>

        <pre class="bg-base-200 rounded p-2 text-xs whitespace-pre-wrap max-h-40 overflow-auto mt-2">{{ sql }}</pre>

        <label class="label cursor-pointer justify-start gap-3 mt-3">
          <input type="checkbox" class="checkbox"
                 [class.checkbox-error]="destructive()" [class.checkbox-warning]="!destructive()"
                 [(ngModel)]="confirmChecked" />
          <span class="label-text">Yes, I want to run this statement against the database.</span>
        </label>

        <div class="modal-action">
          <button class="btn btn-ghost" (click)="confirmOpen.set(false)">Cancel</button>
          <button class="btn" [class.btn-error]="destructive()" [class.btn-warning]="!destructive()"
                  [disabled]="!confirmChecked"
                  (click)="confirmOpen.set(false); run(true)">
            Run {{ destructive() ? destructiveVerb() : 'write' }}
          </button>
        </div>
      </div>
    </dialog>
  `,
})
export class DatabaseConsoleComponent implements OnInit {
  private api = inject(AdminApiService);
  private toast = inject(ToastService);

  stats = signal<DbStats | null>(null);
  result = signal<DbQueryResult | null>(null);
  running = signal(false);
  confirmOpen = signal(false);
  confirmChecked = false;
  sql = '';

  ngOnInit() {
    this.loadStats();
  }

  loadStats() {
    this.api.dbStats().subscribe({
      next: (s) => this.stats.set(s),
      error: () => this.toast.error('Could not load DB stats'),
    });
  }

  private leader(): string {
    return this.sql.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
  }

  warn(): boolean {
    const l = this.leader();
    return !!l && !['SELECT', 'WITH', 'EXPLAIN', 'SHOW', 'TABLE', 'VALUES'].includes(l);
  }

  destructive(): boolean {
    return ['DELETE', 'DROP', 'TRUNCATE'].includes(this.leader());
  }
  destructiveVerb(): string {
    const l = this.leader();
    return l === 'DROP' ? 'DROP' : l === 'TRUNCATE' ? 'TRUNCATE' : 'DELETE';
  }

  run(confirmWrite: boolean) {
    if (!this.sql.trim()) return;
    this.running.set(true);
    this.api.runQuery(this.sql, confirmWrite).subscribe({
      next: (r) => {
        this.running.set(false);
        if (r.requiresConfirmation) {
          this.confirmChecked = false;
          this.confirmOpen.set(true);
          return;
        }
        this.result.set(r);
        if (r.kind === 'write') {
          this.toast.success(`Done — ${r.rowCount} row(s) affected`);
          this.loadStats();
        }
      },
      error: (err) => {
        this.running.set(false);
        const msg = err.error?.message ?? 'Query failed';
        this.toast.error(Array.isArray(msg) ? msg.join(' · ') : msg);
      },
    });
  }

  format(v: unknown): string {
    if (v === null || v === undefined) return '∅';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
}
