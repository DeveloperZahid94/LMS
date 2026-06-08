import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  TiffinApiService, TiffinSubscription, TiffinStats, TiffinStatus,
  TiffinMealType, TiffinMealPlan,
} from './tiffin.service';
import { ToastService } from '../../core/services/toast.service';

type StatusFilter = 'ALL' | TiffinStatus;

@Component({
  selector: 'lms-tiffin',
  standalone: true,
  host: { class: 'flex flex-col h-[calc(100dvh-5.75rem)] min-h-0 overflow-hidden' },
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <!-- HEADER -->
    <div class="flex items-end justify-between mb-4 flex-wrap gap-2 shrink-0">
      <div>
        <h1 class="text-2xl font-bold flex items-center gap-2">🍱 Tiffin Service</h1>
        <p class="text-sm opacity-60 mt-1">Meal subscriptions — pause/resume, delivery assignment & history</p>
      </div>
      <a class="btn btn-primary btn-sm" routerLink="/students/new">+ New subscription (via student)</a>
    </div>

    <!-- STATS -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3 shrink-0" *ngIf="stats() as s">
      <div class="card bg-base-100 border border-base-300 shadow-sm"><div class="card-body p-3">
        <div class="text-xs opacity-60 uppercase tracking-wider">Total</div>
        <div class="text-2xl font-bold">{{ s.total }}</div>
      </div></div>
      <div class="card bg-base-100 border border-base-300 shadow-sm"><div class="card-body p-3">
        <div class="text-xs opacity-60 uppercase tracking-wider">Active</div>
        <div class="text-2xl font-bold text-success">{{ s.active }}</div>
      </div></div>
      <div class="card bg-base-100 border border-base-300 shadow-sm"><div class="card-body p-3">
        <div class="text-xs opacity-60 uppercase tracking-wider">Paused</div>
        <div class="text-2xl font-bold text-warning">{{ s.paused }}</div>
      </div></div>
      <div class="card bg-base-100 border border-base-300 shadow-sm"><div class="card-body p-3">
        <div class="text-xs opacity-60 uppercase tracking-wider">Ended</div>
        <div class="text-2xl font-bold opacity-70">{{ s.ended }}</div>
      </div></div>
      <div class="card bg-base-100 border border-base-300 shadow-sm"><div class="card-body p-3">
        <div class="text-xs opacity-60 uppercase tracking-wider">Active MRR</div>
        <div class="text-2xl font-bold text-primary">₹{{ s.activeRevenue | number }}</div>
      </div></div>
    </div>

    <!-- FILTER BAR -->
    <div class="card bg-base-100 border border-base-300 mb-3 shadow-sm shrink-0">
      <div class="card-body p-2 flex flex-row flex-wrap items-center gap-2">
        <label class="input input-bordered input-sm flex items-center gap-2 flex-1 min-w-[260px]">
          <span class="opacity-50">🔍</span>
          <input type="text" class="grow" [(ngModel)]="search" (ngModelChange)="page.set(1)" placeholder="Search student name, code, phone or delivery person…" />
          <button *ngIf="search" class="opacity-60 hover:opacity-100" (click)="search=''" title="Clear">✕</button>
        </label>
        <div class="join">
          <button *ngFor="let f of statusFilters" class="join-item btn btn-sm"
                  [class.btn-active]="statusFilter() === f.value"
                  (click)="statusFilter.set(f.value); page.set(1)">{{ f.label }}</button>
        </div>
        <button class="btn btn-sm btn-ghost btn-square" (click)="reload()" title="Refresh">⟳</button>
      </div>
    </div>

    <!-- TABLE -->
    <div class="card bg-base-100 border border-base-300 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
      <div class="overflow-auto flex-1 min-h-0">
        <table class="table">
          <thead class="bg-base-200 sticky top-0 z-10">
            <tr class="text-xs uppercase tracking-wider">
              <th>Student</th>
              <th>Meal plan</th>
              <th>Fee</th>
              <th>Delivery</th>
              <th>Next due</th>
              <th>Status</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let t of paged()" class="hover">
              <td>
                <div class="font-semibold">{{ t.student?.fullName }}</div>
                <div class="text-xs opacity-60">{{ t.student?.code }} · {{ t.student?.phone }}</div>
              </td>
              <td>
                <div class="flex items-center gap-1.5">
                  <span class="badge badge-sm" [class.badge-success]="t.mealType==='VEG'" [class.badge-error]="t.mealType==='NONVEG'">
                    {{ t.mealType === 'VEG' ? 'Veg' : 'Non-veg' }}
                  </span>
                  <span class="badge badge-sm badge-outline">{{ mealPlanLabel(t.mealPlan) }}</span>
                </div>
                <div class="text-xs opacity-50 mt-0.5" *ngIf="t.pausedDays > 0">{{ t.pausedDays }} day(s) paused total</div>
              </td>
              <td class="font-medium">₹{{ t.monthlyRate | number }}</td>
              <td>
                <div *ngIf="t.deliveryAssignee; else noDel" class="text-sm">
                  <div class="font-medium">{{ t.deliveryAssignee }}</div>
                  <a *ngIf="t.deliveryPhone" class="text-xs link link-hover opacity-70" [href]="'tel:' + t.deliveryPhone">{{ t.deliveryPhone }}</a>
                </div>
                <ng-template #noDel><span class="text-xs opacity-50 italic">Unassigned</span></ng-template>
              </td>
              <td class="text-sm">
                <span *ngIf="t.nextDueDate; else noDue"
                      [class.text-error]="isExpired(t.nextDueDate)" [class.text-warning]="isExpiringSoon(t.nextDueDate)">
                  {{ t.nextDueDate | date:'dd/MM/yyyy' }}
                </span>
                <ng-template #noDue><span class="opacity-50">—</span></ng-template>
              </td>
              <td>
                <span class="badge"
                  [class.badge-success]="t.status==='ACTIVE'"
                  [class.badge-warning]="t.status==='PAUSED'"
                  [class.badge-ghost]="t.status==='ENDED'">
                  {{ t.status | titlecase }}
                </span>
              </td>
              <td class="text-right">
                <div class="flex items-center justify-end gap-1">
                  <button *ngIf="t.status==='ACTIVE'" class="btn btn-warning btn-xs gap-1" (click)="openPause(t)" title="Pause this tiffin">⏸ Pause</button>
                  <button *ngIf="t.status==='PAUSED'" class="btn btn-success btn-xs gap-1" (click)="openResume(t)" title="Start this tiffin again">▶ Start</button>
                  <button *ngIf="t.status!=='ENDED'" class="btn btn-outline btn-xs gap-1" (click)="openAssign(t)" title="Assign delivery person">🛵 {{ t.deliveryAssignee ? 'Change' : 'Assign' }}</button>
                  <div class="dropdown dropdown-end">
                    <div tabindex="0" role="button" class="btn btn-ghost btn-xs btn-square"><span class="text-lg leading-none">⋯</span></div>
                    <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-30 w-44 p-2 border border-base-300">
                      <li><a (click)="openDetail(t)"><span>👁</span> View details</a></li>
                      <li *ngIf="t.status!=='ENDED'"><a class="text-error" (click)="confirmEnd(t)"><span>⏹</span> End subscription</a></li>
                    </ul>
                  </div>
                </div>
              </td>
            </tr>
            <tr *ngIf="filtered().length === 0 && !loading()">
              <td colspan="7" class="text-center opacity-60 py-10">
                <div class="text-base mb-1">No tiffin subscriptions match your filters.</div>
                <a routerLink="/students/new" class="link link-primary text-sm">Register a student with tiffin →</a>
              </td>
            </tr>
            <tr *ngIf="loading()"><td colspan="7" class="text-center py-6"><span class="loading loading-spinner loading-md"></span></td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- PAGINATION -->
    <div class="flex items-center justify-between pt-3 text-sm flex-wrap gap-2 shrink-0">
      <div class="opacity-60">
        Showing <span class="font-medium">{{ filtered().length === 0 ? 0 : (page() - 1) * pageSize + 1 }}</span>
        to <span class="font-medium">{{ rangeEnd() }}</span>
        of <span class="font-medium">{{ filtered().length }}</span> subscriptions
      </div>
      <div class="join">
        <button class="btn btn-sm join-item" (click)="page.set(1)" [disabled]="page() === 1">«</button>
        <button class="btn btn-sm join-item" (click)="goTo(page() - 1)" [disabled]="page() === 1">Previous</button>
        <button class="btn btn-sm join-item btn-active">{{ page() }} / {{ totalPages() }}</button>
        <button class="btn btn-sm join-item" (click)="goTo(page() + 1)" [disabled]="page() >= totalPages()">Next</button>
        <button class="btn btn-sm join-item" (click)="goTo(totalPages())" [disabled]="page() >= totalPages()">»</button>
      </div>
    </div>

    <!-- ============ PAUSE MODAL ============ -->
    <dialog class="modal" [class.modal-open]="!!pausing()">
      <div class="modal-box max-w-sm" *ngIf="pausing() as t">
        <h3 class="font-bold text-lg">⏸ Pause tiffin</h3>
        <p class="text-sm opacity-70 mt-1">Pausing <strong>{{ t.student?.fullName }}</strong>. No meals delivered while paused; the due date is pushed forward by the paused days on resume.</p>
        <label class="form-control mt-3">
          <div class="label py-1"><span class="label-text">Pause from</span></div>
          <input class="input input-bordered input-sm" type="date" [(ngModel)]="pauseDate" />
        </label>
        <label class="form-control mt-2">
          <div class="label py-1"><span class="label-text">Reason (optional)</span></div>
          <input class="input input-bordered input-sm" [(ngModel)]="pauseReason" placeholder="e.g. Travelling home, exams…" />
        </label>
        <div class="modal-action">
          <button class="btn btn-ghost" (click)="pausing.set(null)">Cancel</button>
          <button class="btn btn-warning" [disabled]="busy()" (click)="doPause()">
            <span *ngIf="busy()" class="loading loading-spinner loading-sm"></span> Pause
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="pausing.set(null)">close</button></form>
    </dialog>

    <!-- ============ RESUME MODAL ============ -->
    <dialog class="modal" [class.modal-open]="!!resuming()">
      <div class="modal-box max-w-sm" *ngIf="resuming() as t">
        <h3 class="font-bold text-lg">▶ Resume tiffin</h3>
        <p class="text-sm opacity-70 mt-1" *ngIf="t.currentPause">
          Paused since <strong>{{ t.currentPause.pausedAt | date:'dd/MM/yyyy' }}</strong>.
          The skipped days will be added back to the next due date.
        </p>
        <label class="form-control mt-3">
          <div class="label py-1"><span class="label-text">Resume from</span></div>
          <input class="input input-bordered input-sm" type="date" [(ngModel)]="resumeDate" />
        </label>
        <div class="alert alert-info mt-3 py-2 text-sm" *ngIf="resumePreviewDays() !== null">
          ≈ {{ resumePreviewDays() }} day(s) paused → due date extended accordingly.
        </div>
        <div class="modal-action">
          <button class="btn btn-ghost" (click)="resuming.set(null)">Cancel</button>
          <button class="btn btn-success" [disabled]="busy()" (click)="doResume()">
            <span *ngIf="busy()" class="loading loading-spinner loading-sm"></span> Resume
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="resuming.set(null)">close</button></form>
    </dialog>

    <!-- ============ ASSIGN DELIVERY MODAL ============ -->
    <dialog class="modal" [class.modal-open]="!!assigning()">
      <div class="modal-box max-w-sm" *ngIf="assigning() as t">
        <h3 class="font-bold text-lg">🛵 Assign delivery</h3>
        <p class="text-sm opacity-70 mt-1">Delivery person for <strong>{{ t.student?.fullName }}</strong>.</p>
        <label class="form-control mt-3">
          <div class="label py-1"><span class="label-text">Delivery person name</span></div>
          <input class="input input-bordered input-sm" [(ngModel)]="assignName" placeholder="e.g. Ramesh Kumar" />
        </label>
        <label class="form-control mt-2">
          <div class="label py-1"><span class="label-text">Phone (optional)</span></div>
          <input class="input input-bordered input-sm" [(ngModel)]="assignPhone" placeholder="e.g. 9876543210" />
        </label>
        <div class="modal-action">
          <button class="btn btn-ghost" (click)="assigning.set(null)">Cancel</button>
          <button class="btn btn-primary" [disabled]="busy()" (click)="doAssign()">
            <span *ngIf="busy()" class="loading loading-spinner loading-sm"></span> Save
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="assigning.set(null)">close</button></form>
    </dialog>

    <!-- ============ DETAIL MODAL ============ -->
    <dialog class="modal" [class.modal-open]="!!detail()">
      <div class="modal-box max-w-lg" *ngIf="detail() as t">
        <h3 class="font-bold text-lg flex items-center gap-2">
          {{ t.student?.fullName }}
          <span class="badge badge-sm"
            [class.badge-success]="t.status==='ACTIVE'" [class.badge-warning]="t.status==='PAUSED'" [class.badge-ghost]="t.status==='ENDED'">
            {{ t.status | titlecase }}
          </span>
        </h3>
        <div class="grid grid-cols-2 gap-3 mt-3 text-sm">
          <div><div class="opacity-50 text-xs uppercase">Meal</div>{{ t.mealType === 'VEG' ? 'Veg' : 'Non-veg' }} · {{ mealPlanLabel(t.mealPlan) }}</div>
          <div><div class="opacity-50 text-xs uppercase">Monthly fee</div>₹{{ t.monthlyRate | number }}</div>
          <div><div class="opacity-50 text-xs uppercase">Started</div>{{ t.startDate | date:'dd/MM/yyyy' }}</div>
          <div><div class="opacity-50 text-xs uppercase">Next due</div>{{ t.nextDueDate ? (t.nextDueDate | date:'dd/MM/yyyy') : '—' }}</div>
          <div><div class="opacity-50 text-xs uppercase">Delivery</div>{{ t.deliveryAssignee || '—' }}<span *ngIf="t.deliveryPhone"> · {{ t.deliveryPhone }}</span></div>
          <div><div class="opacity-50 text-xs uppercase">Total paused</div>{{ t.pausedDays }} day(s)</div>
        </div>

        <div class="divider my-2">Pause history</div>
        <div class="max-h-56 overflow-auto">
          <table class="table table-sm" *ngIf="t.pauses.length > 0; else noHistory">
            <thead><tr class="text-xs uppercase"><th>Paused</th><th>Resumed</th><th>Days</th><th>Reason</th></tr></thead>
            <tbody>
              <tr *ngFor="let p of t.pauses">
                <td>{{ p.pausedAt | date:'dd/MM/yy' }}</td>
                <td>{{ p.resumedAt ? (p.resumedAt | date:'dd/MM/yy') : 'ongoing' }}</td>
                <td>{{ p.days ?? '—' }}</td>
                <td class="max-w-[12rem] truncate">{{ p.reason || '—' }}</td>
              </tr>
            </tbody>
          </table>
          <ng-template #noHistory><p class="text-sm opacity-60 text-center py-3">No pauses recorded yet.</p></ng-template>
        </div>

        <div class="modal-action">
          <button class="btn btn-ghost" (click)="detail.set(null)">Close</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="detail.set(null)">close</button></form>
    </dialog>

    <!-- ============ END CONFIRM ============ -->
    <dialog class="modal" [class.modal-open]="!!ending()">
      <div class="modal-box max-w-sm" *ngIf="ending() as t">
        <h3 class="font-bold text-lg">End subscription?</h3>
        <p class="py-2 text-sm">This stops <strong>{{ t.student?.fullName }}</strong>'s tiffin. History is kept; this can't be undone.</p>
        <div class="modal-action">
          <button class="btn btn-ghost" (click)="ending.set(null)">Cancel</button>
          <button class="btn btn-error" [disabled]="busy()" (click)="doEnd()">
            <span *ngIf="busy()" class="loading loading-spinner loading-sm"></span> End
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="ending.set(null)">close</button></form>
    </dialog>
  `,
})
export class TiffinComponent implements OnInit {
  private api = inject(TiffinApiService);
  private toast = inject(ToastService);

  data = signal<TiffinSubscription[]>([]);
  stats = signal<TiffinStats | null>(null);
  loading = signal(false);
  busy = signal(false);

  search = '';
  statusFilter = signal<StatusFilter>('ALL');
  statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'PAUSED', label: 'Paused' },
    { value: 'ENDED', label: 'Ended' },
  ];

  // modal state
  pausing = signal<TiffinSubscription | null>(null);
  resuming = signal<TiffinSubscription | null>(null);
  assigning = signal<TiffinSubscription | null>(null);
  detail = signal<TiffinSubscription | null>(null);
  ending = signal<TiffinSubscription | null>(null);

  pauseDate = this.todayIso();
  pauseReason = '';
  resumeDate = this.todayIso();
  assignName = '';
  assignPhone = '';

  // pagination
  page = signal(1);
  pageSize = 10;

  filtered = computed(() => {
    const q = this.search.trim().toLowerCase();
    const sf = this.statusFilter();
    return this.data().filter((t) => {
      if (sf !== 'ALL' && t.status !== sf) return false;
      if (!q) return true;
      return (
        t.student?.fullName?.toLowerCase().includes(q) ||
        t.student?.code?.toLowerCase().includes(q) ||
        t.student?.phone?.toLowerCase().includes(q) ||
        (t.deliveryAssignee ?? '').toLowerCase().includes(q)
      ) ?? false;
    });
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  paged = computed(() => {
    const p = Math.min(this.page(), this.totalPages());
    const start = (p - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });

  resumePreviewDays = computed<number | null>(() => {
    const t = this.resuming();
    if (!t?.currentPause) return null;
    const start = new Date(t.currentPause.pausedAt).getTime();
    const end = new Date(this.resumeDate).getTime();
    if (isNaN(end)) return null;
    return Math.max(0, Math.round((end - start) / (24 * 3600 * 1000)));
  });

  ngOnInit() { this.reload(); }

  goTo(p: number) {
    const tp = this.totalPages();
    if (p < 1 || p > tp || p === this.page()) return;
    this.page.set(p);
  }
  rangeEnd(): number { return Math.min(this.page() * this.pageSize, this.filtered().length); }

  reload() {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (rows) => { this.data.set(rows); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.error('Could not load tiffin subscriptions'); },
    });
    this.api.stats().subscribe({ next: (s) => this.stats.set(s), error: () => {} });
  }

  mealPlanLabel(p: TiffinMealPlan): string {
    return p === 'LUNCH' ? 'Lunch' : p === 'DINNER' ? 'Dinner' : 'Lunch + Dinner';
  }

  isExpired(d: string | null): boolean { return !!d && new Date(d).getTime() < Date.now(); }
  isExpiringSoon(d: string | null): boolean {
    if (!d) return false;
    const ms = new Date(d).getTime() - Date.now();
    return ms > 0 && ms < 7 * 24 * 3600 * 1000;
  }

  // ----- open modals -----
  openPause(t: TiffinSubscription) { this.pauseDate = this.todayIso(); this.pauseReason = ''; this.pausing.set(t); this.blur(); }
  openResume(t: TiffinSubscription) { this.resumeDate = this.todayIso(); this.resuming.set(t); this.blur(); }
  openAssign(t: TiffinSubscription) { this.assignName = t.deliveryAssignee ?? ''; this.assignPhone = t.deliveryPhone ?? ''; this.assigning.set(t); this.blur(); }
  openDetail(t: TiffinSubscription) {
    this.detail.set(t); this.blur();
    // Refresh full detail (pauses) in case the row is stale.
    this.api.get(t.id).subscribe({ next: (full) => this.detail.set(full), error: () => {} });
  }
  confirmEnd(t: TiffinSubscription) { this.ending.set(t); this.blur(); }

  // ----- actions -----
  doPause() {
    const t = this.pausing(); if (!t) return;
    this.busy.set(true);
    this.api.pause(t.id, { pausedAt: this.pauseDate, reason: this.pauseReason || undefined }).subscribe({
      next: () => { this.toast.success(`Paused tiffin for ${t.student?.fullName}`); this.afterAction(() => this.pausing.set(null)); },
      error: (e) => this.fail(e, 'Could not pause'),
    });
  }
  doResume() {
    const t = this.resuming(); if (!t) return;
    this.busy.set(true);
    this.api.resume(t.id, { resumedAt: this.resumeDate }).subscribe({
      next: () => { this.toast.success(`Resumed tiffin for ${t.student?.fullName}`); this.afterAction(() => this.resuming.set(null)); },
      error: (e) => this.fail(e, 'Could not resume'),
    });
  }
  doAssign() {
    const t = this.assigning(); if (!t) return;
    this.busy.set(true);
    this.api.update(t.id, { deliveryAssignee: this.assignName.trim(), deliveryPhone: this.assignPhone.trim() }).subscribe({
      next: () => { this.toast.success('Delivery person saved'); this.afterAction(() => this.assigning.set(null)); },
      error: (e) => this.fail(e, 'Could not save delivery person'),
    });
  }
  doEnd() {
    const t = this.ending(); if (!t) return;
    this.busy.set(true);
    this.api.end(t.id).subscribe({
      next: () => { this.toast.success(`Ended tiffin for ${t.student?.fullName}`); this.afterAction(() => this.ending.set(null)); },
      error: (e) => this.fail(e, 'Could not end subscription'),
    });
  }

  private afterAction(close: () => void) { this.busy.set(false); close(); this.reload(); }
  private fail(err: any, fallback: string) {
    this.busy.set(false);
    const msg = err?.error?.message;
    this.toast.error(Array.isArray(msg) ? msg.join(' · ') : (msg ?? fallback));
  }

  private blur() { (document.activeElement as HTMLElement | null)?.blur(); }
  private todayIso(): string { return new Date().toISOString().slice(0, 10); }
}
