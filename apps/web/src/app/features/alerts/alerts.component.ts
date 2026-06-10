import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { debounceTime, Subject } from 'rxjs';
import { RouterLink } from '@angular/router';
import { AlertsApiService, AlertsResponse, BalanceAlert, DueSoonAlert, ExpiringAlert, OverdueAlert, NotifyChannel, NotifyRecipient } from './alerts.service';
import { BranchesApiService, Branch } from '../students/branches.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { ExportToolbarComponent } from '../../shared/components/export-toolbar.component';
import { ExportColumn, exportCsv, exportPdf, fmtDate } from '../../shared/utils/export.util';

type TabKey = 'overdue' | 'dueSoon' | 'expiring' | 'balance';

@Component({
  selector: 'lms-alerts',
  standalone: true,
  host: { class: 'flex flex-col h-[calc(100dvh-5.75rem)] min-h-0 overflow-hidden' },
  imports: [CommonModule, FormsModule, RouterLink, ExportToolbarComponent],
  template: `
    <div class="mb-4 flex items-end justify-between flex-wrap gap-2 shrink-0">
      <div>
        <h1 class="text-2xl font-bold flex items-center gap-2">Alerts
          <span *ngIf="data() && data()!.counts.total > 0" class="badge badge-error">{{ data()!.counts.total }}</span>
        </h1>
        <p class="text-sm opacity-60">Overdue installments, payments due soon, and memberships about to expire.</p>
      </div>
      <div class="flex gap-2 flex-wrap">
        <select class="select select-bordered select-sm" [(ngModel)]="branchFilter" (ngModelChange)="reload()">
          <option [ngValue]="undefined">All branches</option>
          <option *ngFor="let b of branches()" [value]="b.id">{{ b.name }}</option>
        </select>
        <input class="input input-bordered input-sm w-64"
               [(ngModel)]="search"
               (ngModelChange)="onSearch()"
               placeholder="Search by name, seat, or summary" />
      </div>
    </div>

    <div class="card bg-base-100 border border-base-300 mb-4 shrink-0">
      <div class="card-body py-3 flex flex-row flex-wrap items-center gap-2">
        <span class="text-xs opacity-60">Filter by due / expiry date:</span>
        <lms-export-toolbar
          [dateFrom]="dateFrom"
          [dateTo]="dateTo"
          (rangeChange)="onRangeChange($event)"
          (exportRequested)="doExport($event)">
        </lms-export-toolbar>
        <span class="text-xs opacity-50 ml-auto">
          Exports the <span class="font-medium">{{ tabLabel() }}</span> list. Pick a tab below to switch.
        </span>
      </div>
    </div>

    <!-- Stat tiles + tabs -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 shrink-0">
      <div class="card border cursor-pointer transition-all"
           [class.border-error]="tab() === 'overdue'"
           [class.border-base-300]="tab() !== 'overdue'"
           [class.bg-error]="tab() === 'overdue'"
           [class.bg-opacity-5]="tab() === 'overdue'"
           [class.bg-base-100]="tab() !== 'overdue'"
           (click)="tab.set('overdue')">
        <div class="card-body p-4">
          <div class="text-xs uppercase tracking-wider opacity-60">Overdue installments</div>
          <div class="text-3xl font-bold text-error">{{ data()?.counts?.overdue ?? 0 }}</div>
          <div class="text-xs opacity-60">Past due — collect immediately</div>
        </div>
      </div>
      <div class="card border cursor-pointer transition-all"
           [class.border-warning]="tab() === 'dueSoon'"
           [class.border-base-300]="tab() !== 'dueSoon'"
           [class.bg-warning]="tab() === 'dueSoon'"
           [class.bg-opacity-5]="tab() === 'dueSoon'"
           [class.bg-base-100]="tab() !== 'dueSoon'"
           (click)="tab.set('dueSoon')">
        <div class="card-body p-4">
          <div class="text-xs uppercase tracking-wider opacity-60">Due within 7 days</div>
          <div class="text-3xl font-bold text-warning">{{ data()?.counts?.dueSoon ?? 0 }}</div>
          <div class="text-xs opacity-60">Send a friendly reminder</div>
        </div>
      </div>
      <div class="card border cursor-pointer transition-all"
           [class.border-info]="tab() === 'expiring'"
           [class.border-base-300]="tab() !== 'expiring'"
           [class.bg-info]="tab() === 'expiring'"
           [class.bg-opacity-5]="tab() === 'expiring'"
           [class.bg-base-100]="tab() !== 'expiring'"
           (click)="tab.set('expiring')">
        <div class="card-body p-4">
          <div class="text-xs uppercase tracking-wider opacity-60">Membership expiring</div>
          <div class="text-3xl font-bold text-info">{{ data()?.counts?.expiringSoon ?? 0 }}</div>
          <div class="text-xs opacity-60">Within next 7 days</div>
        </div>
      </div>
      <div class="card border cursor-pointer transition-all"
           [class.border-error]="tab() === 'balance'"
           [class.border-base-300]="tab() !== 'balance'"
           [class.bg-error]="tab() === 'balance'"
           [class.bg-opacity-5]="tab() === 'balance'"
           [class.bg-base-100]="tab() !== 'balance'"
           (click)="tab.set('balance')">
        <div class="card-body p-4">
          <div class="text-xs uppercase tracking-wider opacity-60">Balance due</div>
          <div class="text-3xl font-bold text-error">{{ data()?.counts?.balanceDue ?? 0 }}</div>
          <div class="text-xs opacity-60">Part payments — collect the rest</div>
        </div>
      </div>
    </div>

    <!-- Bulk send bar -->
    <div *ngIf="currentCount() > 0" class="flex items-center gap-2 mb-2 text-sm flex-wrap shrink-0">
      <span class="opacity-60">Notify everyone in <span class="font-medium">{{ tabLabel() }}</span> ({{ currentCount() }}):</span>
      <div class="dropdown">
        <div tabindex="0" role="button" class="btn btn-xs btn-outline">
          Send to all
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-30 mt-1 w-44 p-2 border border-base-300">
          <li><a (click)="sendAlertBulk('email')"><span>✉</span> Email all</a></li>
          <li><a (click)="sendAlertBulk('sms')"><span>💬</span> SMS all</a></li>
          <li><a (click)="sendAlertBulk('whatsapp')"><span>🟢</span> WhatsApp all</a></li>
        </ul>
      </div>
    </div>

    <!-- The active tab's table fills this region and scrolls internally (matches Students) -->
    <div class="flex-1 min-h-0 flex flex-col">

    <!-- Overdue -->
    <ng-container *ngIf="tab() === 'overdue'">
      <div class="card bg-base-100 border border-base-300 overflow-hidden flex flex-col flex-1 min-h-0">
        <div class="overflow-auto flex-1 min-h-0">
          <table class="table table-zebra">
            <thead class="sticky top-0 z-10 bg-base-100">
              <tr><th>Student</th><th>Seat</th><th>Shift</th><th>Rate</th><th>Due on</th><th>Days past</th><th class="text-right">Actions</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let a of data()?.overdue ?? []">
                <td>
                  <div class="font-medium">{{ a.student.fullName }}</div>
                  <div class="opacity-60 text-xs">{{ a.student.code }} · {{ a.student.phone }}</div>
                </td>
                <td><code class="text-xs bg-base-200 px-1.5 py-0.5 rounded">{{ a.seat.code }}</code> <span class="opacity-60 text-xs">{{ a.seat.type }}</span></td>
                <td><span class="badge badge-outline">{{ a.shift }}</span></td>
                <td class="text-sm">{{ a.monthlyRate ? '₹' + (a.monthlyRate | number) : '—' }}</td>
                <td class="text-sm">{{ a.nextDueDate | date:'mediumDate' }}</td>
                <td><span class="badge badge-error">{{ a.daysPast }}d</span></td>
                <td class="text-right">
                  <div class="flex items-center justify-end gap-2">
                    <a class="btn btn-primary btn-xs" routerLink="/payments">Record payment</a>
                    <div class="dropdown dropdown-end">
                      <div tabindex="0" role="button" class="btn btn-xs btn-outline">
                        Send
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-30 mt-1 w-44 p-2 border border-base-300">
                        <li><a (click)="sendAlert('email', a)"><span>✉</span> Email</a></li>
                        <li><a (click)="sendAlert('sms', a)"><span>💬</span> SMS</a></li>
                        <li><a (click)="sendAlert('whatsapp', a)"><span>🟢</span> WhatsApp</a></li>
                      </ul>
                    </div>
                  </div>
                </td>
              </tr>
              <tr *ngIf="(data()?.overdue?.length ?? 0) === 0">
                <td colspan="7" class="text-center opacity-60 py-8">No overdue installments. Nice work.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </ng-container>

    <!-- Due soon -->
    <ng-container *ngIf="tab() === 'dueSoon'">
      <div class="card bg-base-100 border border-base-300 overflow-hidden flex flex-col flex-1 min-h-0">
        <div class="overflow-auto flex-1 min-h-0">
          <table class="table table-zebra">
            <thead class="sticky top-0 z-10 bg-base-100">
              <tr><th>Student</th><th>Seat</th><th>Shift</th><th>Rate</th><th>Due on</th><th>In</th><th class="text-right">Actions</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let a of data()?.dueSoon ?? []">
                <td>
                  <div class="font-medium">{{ a.student.fullName }}</div>
                  <div class="opacity-60 text-xs">{{ a.student.code }} · {{ a.student.phone }}</div>
                </td>
                <td><code class="text-xs bg-base-200 px-1.5 py-0.5 rounded">{{ a.seat.code }}</code> <span class="opacity-60 text-xs">{{ a.seat.type }}</span></td>
                <td><span class="badge badge-outline">{{ a.shift }}</span></td>
                <td class="text-sm">{{ a.monthlyRate ? '₹' + (a.monthlyRate | number) : '—' }}</td>
                <td class="text-sm">{{ a.nextDueDate | date:'mediumDate' }}</td>
                <td><span class="badge badge-warning">{{ a.daysUntil }}d</span></td>
                <td class="text-right">
                  <div class="flex items-center justify-end gap-2">
                    <a class="btn btn-ghost btn-xs" routerLink="/payments">Record payment</a>
                    <div class="dropdown dropdown-end">
                      <div tabindex="0" role="button" class="btn btn-xs btn-outline">
                        Send
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-30 mt-1 w-44 p-2 border border-base-300">
                        <li><a (click)="sendAlert('email', a)"><span>✉</span> Email</a></li>
                        <li><a (click)="sendAlert('sms', a)"><span>💬</span> SMS</a></li>
                        <li><a (click)="sendAlert('whatsapp', a)"><span>🟢</span> WhatsApp</a></li>
                      </ul>
                    </div>
                  </div>
                </td>
              </tr>
              <tr *ngIf="(data()?.dueSoon?.length ?? 0) === 0">
                <td colspan="7" class="text-center opacity-60 py-8">Nothing due in the next 7 days.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </ng-container>

    <!-- Expiring memberships -->
    <ng-container *ngIf="tab() === 'expiring'">
      <div class="card bg-base-100 border border-base-300 overflow-hidden flex flex-col flex-1 min-h-0">
        <div class="overflow-auto flex-1 min-h-0">
          <table class="table table-zebra">
            <thead class="sticky top-0 z-10 bg-base-100">
              <tr><th>Student</th><th>Phone</th><th>Expires</th><th>In</th><th class="text-right">Actions</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let a of data()?.expiringSoon ?? []">
                <td>
                  <div class="font-medium">{{ a.student.fullName }}</div>
                  <div class="opacity-60 text-xs">{{ a.student.code }}</div>
                </td>
                <td class="text-sm">{{ a.student.phone }}</td>
                <td class="text-sm">{{ a.expiresAt | date:'mediumDate' }}</td>
                <td><span class="badge badge-info">{{ a.daysUntil }}d</span></td>
                <td class="text-right">
                  <div class="flex items-center justify-end gap-2">
                    <a class="btn btn-ghost btn-xs" [routerLink]="['/students', a.student.id]">Open student</a>
                    <div class="dropdown dropdown-end">
                      <div tabindex="0" role="button" class="btn btn-xs btn-outline">
                        Send
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-30 mt-1 w-44 p-2 border border-base-300">
                        <li><a (click)="sendAlert('email', a)"><span>✉</span> Email</a></li>
                        <li><a (click)="sendAlert('sms', a)"><span>💬</span> SMS</a></li>
                        <li><a (click)="sendAlert('whatsapp', a)"><span>🟢</span> WhatsApp</a></li>
                      </ul>
                    </div>
                  </div>
                </td>
              </tr>
              <tr *ngIf="(data()?.expiringSoon?.length ?? 0) === 0">
                <td colspan="5" class="text-center opacity-60 py-8">No memberships expiring soon.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </ng-container>

    <!-- Balance due -->
    <ng-container *ngIf="tab() === 'balance'">
      <div class="card bg-base-100 border border-base-300 overflow-hidden flex flex-col flex-1 min-h-0">
        <div class="overflow-auto flex-1 min-h-0">
          <table class="table table-zebra">
            <thead class="sticky top-0 z-10 bg-base-100">
              <tr><th>Student</th><th>Phone</th><th>Balance due</th><th class="text-right">Actions</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let a of data()?.balanceDue ?? []">
                <td>
                  <div class="font-medium">{{ a.student.fullName }}</div>
                  <div class="opacity-60 text-xs">{{ a.student.code }}</div>
                </td>
                <td class="text-sm">{{ a.student.phone }}</td>
                <td><span class="badge badge-error">₹{{ a.amount | number }}</span></td>
                <td class="text-right">
                  <div class="flex items-center justify-end gap-2">
                    <a class="btn btn-primary btn-xs" [routerLink]="['/students', a.student.id, 'profile']">Collect balance</a>
                    <div class="dropdown dropdown-end">
                      <div tabindex="0" role="button" class="btn btn-xs btn-outline">
                        Send
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-30 mt-1 w-44 p-2 border border-base-300">
                        <li><a (click)="sendAlert('email', a)"><span>✉</span> Email</a></li>
                        <li><a (click)="sendAlert('sms', a)"><span>💬</span> SMS</a></li>
                        <li><a (click)="sendAlert('whatsapp', a)"><span>🟢</span> WhatsApp</a></li>
                      </ul>
                    </div>
                  </div>
                </td>
              </tr>
              <tr *ngIf="(data()?.balanceDue?.length ?? 0) === 0">
                <td colspan="4" class="text-center opacity-60 py-8">No outstanding balances. All settled.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </ng-container>

    </div>
    <!-- /scroll region -->
  `,
})
export class AlertsComponent implements OnInit {
  private api = inject(AlertsApiService);
  private branchesApi = inject(BranchesApiService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  sending = signal(false);
  data = signal<AlertsResponse | null>(null);
  branches = signal<Branch[]>([]);
  branchFilter: string | undefined = undefined;
  search = '';

  dateFrom = '';
  dateTo = '';

  tab = signal<TabKey>('overdue');
  private search$ = new Subject<void>();

  tabLabel = computed(() =>
    this.tab() === 'overdue' ? 'Overdue' :
    this.tab() === 'dueSoon' ? 'Due-soon' :
    this.tab() === 'balance' ? 'Balance-due' : 'Expiring',
  );

  currentCount = computed(() => {
    const d = this.data();
    if (!d) return 0;
    return this.tab() === 'overdue' ? d.overdue.length
      : this.tab() === 'dueSoon' ? d.dueSoon.length
      : this.tab() === 'balance' ? d.balanceDue.length
      : d.expiringSoon.length;
  });

  ngOnInit() {
    this.branchesApi.list().subscribe((bs) => this.branches.set(bs));
    this.search$.pipe(debounceTime(250)).subscribe(() => this.reload());
    this.reload();
  }

  onSearch() { this.search$.next(); }

  reload() {
    this.api.list({
      branchId: this.branchFilter,
      search: this.search || undefined,
      dateFrom: this.dateFrom || undefined,
      dateTo: this.dateTo || undefined,
    }).subscribe({
      next: (r) => this.data.set(r),
      error: () => this.toast.error('Could not load alerts'),
    });
  }

  onRangeChange(r: { from: string; to: string }) {
    this.dateFrom = r.from;
    this.dateTo = r.to;
    this.reload();
  }

  doExport(kind: 'csv' | 'pdf') {
    const d = this.data();
    if (!d) {
      this.toast.error('No data loaded yet');
      return;
    }
    const f = this.dateFrom ? fmtDate(this.dateFrom) : 'today';
    const t = this.dateTo ? fmtDate(this.dateTo) : 'default window';
    const range = `${f} – ${t}`;

    if (this.tab() === 'overdue') {
      this.exportRows<OverdueAlert>(d.overdue, [
        { header: 'Student code', value: (a) => a.student.code },
        { header: 'Student name', value: (a) => a.student.fullName },
        { header: 'Phone', value: (a) => a.student.phone },
        { header: 'Seat', value: (a) => a.seat.code },
        { header: 'Seat type', value: (a) => a.seat.type },
        { header: 'Shift', value: (a) => a.shift },
        { header: 'Rate (INR)', value: (a) => a.monthlyRate ?? '' },
        { header: 'Due on', value: (a) => fmtDate(a.nextDueDate) },
        { header: 'Days past', value: (a) => a.daysPast },
      ], kind, 'Overdue installments', range);
    } else if (this.tab() === 'dueSoon') {
      this.exportRows<DueSoonAlert>(d.dueSoon, [
        { header: 'Student code', value: (a) => a.student.code },
        { header: 'Student name', value: (a) => a.student.fullName },
        { header: 'Phone', value: (a) => a.student.phone },
        { header: 'Seat', value: (a) => a.seat.code },
        { header: 'Seat type', value: (a) => a.seat.type },
        { header: 'Shift', value: (a) => a.shift },
        { header: 'Rate (INR)', value: (a) => a.monthlyRate ?? '' },
        { header: 'Due on', value: (a) => fmtDate(a.nextDueDate) },
        { header: 'Days until', value: (a) => a.daysUntil },
      ], kind, 'Payments due soon', range);
    } else if (this.tab() === 'expiring') {
      this.exportRows<ExpiringAlert>(d.expiringSoon, [
        { header: 'Student code', value: (a) => a.student.code },
        { header: 'Student name', value: (a) => a.student.fullName },
        { header: 'Phone', value: (a) => a.student.phone },
        { header: 'Expires on', value: (a) => fmtDate(a.expiresAt) },
        { header: 'Days until', value: (a) => a.daysUntil },
      ], kind, 'Memberships expiring', range);
    } else {
      this.exportRows<BalanceAlert>(d.balanceDue, [
        { header: 'Student code', value: (a) => a.student.code },
        { header: 'Student name', value: (a) => a.student.fullName },
        { header: 'Phone', value: (a) => a.student.phone },
        { header: 'Balance due (INR)', value: (a) => a.amount },
      ], kind, 'Outstanding balances', range);
    }
  }

  /** Send a reminder to one student over the chosen channel. */
  sendAlert(channel: 'email' | 'sms' | 'whatsapp', a: any) {
    (document.activeElement as HTMLElement | null)?.blur();
    this.dispatch(channel, [{ studentId: a.student.id, message: this.messageFor(a), subject: this.subjectFor(a) }]);
  }

  /** Send a reminder to everyone in the active tab. */
  sendAlertBulk(channel: 'email' | 'sms' | 'whatsapp') {
    (document.activeElement as HTMLElement | null)?.blur();
    const rows = this.activeRows();
    if (!rows.length) { this.toast.info('Nothing to send in this list.'); return; }
    const label = this.channelLabel(channel);
    if (!confirm(`Send ${label} to all ${rows.length} student(s) in "${this.tabLabel()}"?`)) return;
    const recipients: NotifyRecipient[] = rows.map((a) => ({
      studentId: a.student.id, message: this.messageFor(a), subject: this.subjectFor(a),
    }));
    this.dispatch(channel, recipients);
  }

  private dispatch(channel: 'email' | 'sms' | 'whatsapp', recipients: NotifyRecipient[]) {
    if (this.sending()) return;
    const apiChannel = channel.toUpperCase() as NotifyChannel;
    const label = this.channelLabel(channel);
    this.sending.set(true);
    this.api.notify(apiChannel, recipients).subscribe({
      next: (r) => {
        this.sending.set(false);
        if (r.sent && !r.failed) this.toast.success(`${label} sent to ${r.sent} student${r.sent === 1 ? '' : 's'}.`);
        else if (r.sent && r.failed) this.toast.warning(`${label}: sent ${r.sent}, failed ${r.failed}.${r.errors[0] ? ' ' + r.errors[0] : ''}`);
        else this.toast.error(`${label} failed.${r.errors[0] ? ' ' + r.errors[0] : ' Check the channel is configured.'}`);
      },
      error: (e) => {
        this.sending.set(false);
        this.toast.error(e.error?.message ?? `Could not send ${label}`);
      },
    });
  }

  private channelLabel(c: 'email' | 'sms' | 'whatsapp'): string {
    return c === 'email' ? 'Email' : c === 'sms' ? 'SMS' : 'WhatsApp';
  }

  private activeRows(): any[] {
    const d = this.data();
    if (!d) return [];
    return this.tab() === 'overdue' ? d.overdue
      : this.tab() === 'dueSoon' ? d.dueSoon
      : this.tab() === 'balance' ? d.balanceDue
      : d.expiringSoon;
  }

  private orgName(): string {
    const slug = this.auth.user()?.tenantSlug ?? '';
    return slug ? slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'our library';
  }

  /** Build a student-facing reminder message from the alert. */
  private messageFor(a: any): string {
    const name = a.student?.fullName ?? 'Student';
    const org = this.orgName();
    const due = a.nextDueDate ? new Date(a.nextDueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    const rate = a.monthlyRate ? `₹${Number(a.monthlyRate).toLocaleString('en-IN')} ` : '';
    switch (a.kind) {
      case 'OVERDUE':
        return `Dear ${name}, your ${rate}payment for seat ${a.seat?.code} is overdue by ${a.daysPast} day${a.daysPast === 1 ? '' : 's'}. Please clear your dues at the earliest. — ${org}`;
      case 'DUE_SOON':
        return `Dear ${name}, your ${rate}payment for seat ${a.seat?.code} is due in ${a.daysUntil} day${a.daysUntil === 1 ? '' : 's'}${due ? ` (by ${due})` : ''}. Kindly pay on time. — ${org}`;
      case 'EXPIRING': {
        const exp = a.expiresAt ? new Date(a.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        return `Dear ${name}, your membership expires in ${a.daysUntil} day${a.daysUntil === 1 ? '' : 's'}${exp ? ` (on ${exp})` : ''}. Please renew to continue. — ${org}`;
      }
      case 'BALANCE':
        return `Dear ${name}, you have an outstanding balance of ₹${Number(a.amount).toLocaleString('en-IN')}. Kindly clear your dues. — ${org}`;
      default:
        return `Dear ${name}, this is a reminder from ${org}.`;
    }
  }

  private subjectFor(a: any): string {
    switch (a.kind) {
      case 'OVERDUE':  return 'Payment overdue';
      case 'DUE_SOON': return 'Payment reminder';
      case 'EXPIRING': return 'Membership expiring soon';
      case 'BALANCE':  return 'Outstanding balance';
      default:         return 'Reminder';
    }
  }

  private exportRows<T>(rows: T[], cols: ExportColumn<T>[], kind: 'csv' | 'pdf', title: string, range: string) {
    if (rows.length === 0) {
      this.toast.error(`No ${title.toLowerCase()} records in the selected range`);
      return;
    }
    const meta = { title, subtitle: `Date range: ${range} · ${rows.length} record${rows.length === 1 ? '' : 's'}`, fileSlug: title.toLowerCase().replace(/\s+/g, '-') };
    if (kind === 'csv') exportCsv(rows, cols, meta);
    else exportPdf(rows, cols, meta);
    this.toast.success(`Exported ${rows.length} ${title.toLowerCase()} record${rows.length === 1 ? '' : 's'} as ${kind.toUpperCase()}`);
  }
}
