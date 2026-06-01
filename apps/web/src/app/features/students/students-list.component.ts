import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, Subject } from 'rxjs';
import { StudentsApiService, ListStudentsQuery, StudentRow } from './students.service';
import { ToastService } from '../../core/services/toast.service';
import { ExportToolbarComponent } from '../../shared/components/export-toolbar.component';
import { ExportColumn, exportCsv, exportPdf, fmtDate } from '../../shared/utils/export.util';

type SortField = NonNullable<ListStudentsQuery['sortBy']>;
type ViewMode = 'list' | 'grid';

const AVATAR_PALETTE = [
  'bg-rose-200 text-rose-800',
  'bg-amber-200 text-amber-800',
  'bg-emerald-200 text-emerald-800',
  'bg-sky-200 text-sky-800',
  'bg-indigo-200 text-indigo-800',
  'bg-fuchsia-200 text-fuchsia-800',
  'bg-teal-200 text-teal-800',
  'bg-lime-200 text-lime-800',
];

@Component({
  selector: 'lms-students-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ExportToolbarComponent],
  template: `
    <!-- =============================== HEADER =============================== -->
    <div class="flex items-end justify-between mb-5 flex-wrap gap-2">
      <div>
        <h1 class="text-2xl font-bold">Students</h1>
        <p class="text-sm opacity-60 mt-1">Manage your library and study-cabin students</p>
      </div>
      <a class="btn btn-primary btn-sm" routerLink="/students/new">+ Add student</a>
    </div>

    <!-- =============================== FILTER BAR =============================== -->
    <div class="card bg-base-100 border border-base-300 mb-4 shadow-sm">
      <div class="card-body p-3 flex flex-row flex-wrap items-center gap-2">
        <label class="input input-bordered input-md flex items-center gap-2 flex-1 min-w-[280px]">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input type="text" class="grow" [(ngModel)]="search" (ngModelChange)="onSearch()"
                 placeholder="Search by name, ID, phone, or Aadhaar…" />
          <button *ngIf="search" class="opacity-60 hover:opacity-100" (click)="search=''; onSearch()" title="Clear">✕</button>
        </label>

        <div class="tooltip" data-tip="Filters">
          <button class="btn btn-md btn-square btn-ghost"
                  [class.btn-active]="hasActiveFilters()"
                  (click)="toggleFilters.set(!toggleFilters())">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h18M6 8h12M9 12h6M11 16h2" />
            </svg>
          </button>
        </div>

        <select class="select select-bordered select-md" [(ngModel)]="status" (ngModelChange)="reload()">
          <option [ngValue]="undefined">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="INACTIVE">Inactive</option>
        </select>

        <select class="select select-bordered select-md" [(ngModel)]="accomFilter" (ngModelChange)="page.set(1)">
          <option [ngValue]="'ALL'">All Types</option>
          <option [ngValue]="'WITH_SEAT'">With seat</option>
          <option [ngValue]="'NO_SEAT'">No seat</option>
        </select>

        <div class="dropdown dropdown-end">
          <div tabindex="0" role="button" class="btn btn-md btn-outline">
            Sort by {{ sortLabel() }}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-30 mt-1 w-48 p-2 border border-base-300">
            <li *ngFor="let o of sortOptions"><a (click)="setSort(o.field)">{{ o.label }}</a></li>
            <li class="menu-title text-xs">Direction</li>
            <li><a (click)="toggleDir()">{{ sortOrder() === 'asc' ? 'Ascending ↑' : 'Descending ↓' }}</a></li>
          </ul>
        </div>

        <div class="join">
          <button class="join-item btn btn-md btn-square" [class.btn-active]="view() === 'grid'" (click)="view.set('grid')" title="Grid view">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h6v6H4zM14 6h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
            </svg>
          </button>
          <button class="join-item btn btn-md btn-square" [class.btn-active]="view() === 'list'" (click)="view.set('list')" title="List view">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Collapsible advanced filters: registration-date range + export -->
      <div *ngIf="toggleFilters()" class="border-t border-base-300 px-4 py-3 flex flex-wrap items-center gap-2">
        <span class="text-xs uppercase tracking-wider opacity-60 font-semibold">Registration date:</span>
        <lms-export-toolbar
          [dateFrom]="dateFrom"
          [dateTo]="dateTo"
          (rangeChange)="onRangeChange($event)"
          (exportRequested)="doExport($event)">
        </lms-export-toolbar>
        <select class="select select-bordered select-sm ml-2" [(ngModel)]="limit" (ngModelChange)="onPageSizeChange()">
          <option [ngValue]="10">10 / page</option>
          <option [ngValue]="25">25 / page</option>
          <option [ngValue]="50">50 / page</option>
          <option [ngValue]="100">100 / page</option>
        </select>
      </div>
    </div>

    <!-- =============================== LIST VIEW =============================== -->
    <div *ngIf="view() === 'list'" class="card bg-base-100 border border-base-300 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="table">
          <thead class="bg-base-200">
            <tr class="text-xs uppercase tracking-wider">
              <th>Student</th>
              <th>Contact</th>
              <th>Accommodation</th>
              <th>Dates</th>
              <th>Status</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let s of data()" class="hover">
              <td>
                <div class="flex items-center gap-3">
                  <div class="avatar placeholder">
                    <div class="w-10 h-10 rounded-full" [class]="avatarClass(s)">
                      <span class="text-sm font-semibold">{{ initials(s.fullName) }}</span>
                    </div>
                  </div>
                  <div>
                    <div class="font-semibold">{{ s.fullName }}</div>
                    <div class="text-xs opacity-60 mt-0.5">{{ s.code }}</div>
                  </div>
                </div>
              </td>
              <td>
                <div class="text-sm">{{ s.phone }}</div>
                <div class="text-xs opacity-60" *ngIf="s.email">{{ s.email }}</div>
              </td>
              <td>
                <div *ngIf="s.activeSeat; else noSeat">
                  <div class="font-medium text-sm">{{ s.activeSeat.seatCode }}</div>
                  <span class="badge badge-success badge-sm mt-1">{{ s.activeSeat.seatType | titlecase }}</span>
                </div>
                <ng-template #noSeat>
                  <span class="opacity-50 text-sm">N/A</span>
                  <div><span class="badge badge-ghost badge-sm mt-1">NO SEAT</span></div>
                </ng-template>
              </td>
              <td class="text-sm">
                <div>Joined: <span class="font-medium">{{ s.joinedAt | date:'dd/MM/yyyy' }}</span></div>
                <div class="font-semibold mt-0.5">
                  Paid Until:
                  <span *ngIf="paidUntil(s); else expRow" [class.text-error]="isExpired(paidUntil(s))" [class.text-warning]="isExpiringSoon(paidUntil(s))">
                    {{ paidUntil(s) | date:'dd/MM/yyyy' }}
                  </span>
                  <ng-template #expRow><span class="opacity-50">—</span></ng-template>
                </div>
              </td>
              <td>
                <span class="badge"
                  [class.badge-success]="s.status==='ACTIVE'"
                  [class.badge-warning]="s.status==='SUSPENDED'"
                  [class.badge-ghost]="s.status==='INACTIVE'">
                  {{ s.status | titlecase }}
                </span>
              </td>
              <td class="text-right">
                <div class="dropdown dropdown-end">
                  <div tabindex="0" role="button" class="btn btn-ghost btn-sm btn-square">
                    <span class="text-lg leading-none">⋯</span>
                  </div>
                  <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-30 w-44 p-2 border border-base-300">
                    <li><a (click)="view_(s)"><span>👁</span> View details</a></li>
                    <li><a [routerLink]="['/students', s.id]"><span>✎</span> Edit</a></li>
                    <li class="menu-title text-xs">Actions</li>
                    <li><a (click)="comingSoon('Send reminder')"><span>🔔</span> Send reminder</a></li>
                    <li><a (click)="comingSoon('Print profile')"><span>🖨</span> Print profile</a></li>
                    <li><a class="text-error" (click)="confirmDelete(s)"><span>🗑</span> Delete</a></li>
                  </ul>
                </div>
              </td>
            </tr>
            <tr *ngIf="data().length === 0 && !loading()">
              <td colspan="6" class="text-center opacity-60 py-10">
                <div class="text-base mb-1">No students match your filters.</div>
                <a routerLink="/students/new" class="link link-primary text-sm">Add the first student →</a>
              </td>
            </tr>
            <tr *ngIf="loading()">
              <td colspan="6" class="text-center py-6">
                <span class="loading loading-spinner loading-md"></span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- =============================== GRID VIEW =============================== -->
    <div *ngIf="view() === 'grid'">
      <div *ngIf="loading()" class="text-center py-10"><span class="loading loading-spinner loading-md"></span></div>
      <div *ngIf="!loading() && data().length === 0" class="text-center opacity-60 py-10">
        <div class="text-base mb-1">No students match your filters.</div>
        <a routerLink="/students/new" class="link link-primary text-sm">Add the first student →</a>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <div *ngFor="let s of data()" class="card bg-base-100 border border-base-300 shadow-sm hover:shadow-md transition-shadow">
          <div class="card-body p-4">
            <div class="flex items-start gap-3">
              <div class="avatar placeholder">
                <div class="w-12 h-12 rounded-full" [class]="avatarClass(s)">
                  <span class="text-base font-semibold">{{ initials(s.fullName) }}</span>
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-semibold truncate">{{ s.fullName }}</div>
                <div class="text-xs opacity-60">{{ s.code }}</div>
              </div>
              <span class="badge badge-sm"
                [class.badge-success]="s.status==='ACTIVE'"
                [class.badge-warning]="s.status==='SUSPENDED'"
                [class.badge-ghost]="s.status==='INACTIVE'">
                {{ s.status }}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-2 mt-3 text-xs">
              <div>
                <div class="opacity-50 uppercase tracking-wide">Phone</div>
                <div class="font-medium truncate">{{ s.phone }}</div>
              </div>
              <div>
                <div class="opacity-50 uppercase tracking-wide">Seat</div>
                <div class="font-medium" *ngIf="s.activeSeat; else gridNoSeat">{{ s.activeSeat.seatCode }}</div>
                <ng-template #gridNoSeat><div class="opacity-50">—</div></ng-template>
              </div>
              <div>
                <div class="opacity-50 uppercase tracking-wide">Joined</div>
                <div class="font-medium">{{ s.joinedAt | date:'dd MMM yy' }}</div>
              </div>
              <div>
                <div class="opacity-50 uppercase tracking-wide">Paid Until</div>
                <div class="font-medium"
                     [class.text-error]="isExpired(paidUntil(s))"
                     [class.text-warning]="isExpiringSoon(paidUntil(s))">
                  {{ paidUntil(s) ? (paidUntil(s) | date:'dd MMM yy') : '—' }}
                </div>
              </div>
            </div>

            <div class="card-actions justify-between mt-3 pt-3 border-t border-base-200">
              <span class="badge badge-sm" *ngIf="s.activeSeat" [class]="seatTypeBadgeClass(s.activeSeat.seatType)">
                {{ s.activeSeat.seatType | titlecase }}
              </span>
              <span *ngIf="!s.activeSeat" class="badge badge-ghost badge-sm">No seat</span>
              <div class="dropdown dropdown-end dropdown-top">
                <div tabindex="0" role="button" class="btn btn-ghost btn-xs btn-square">⋯</div>
                <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-30 w-44 p-2 border border-base-300">
                  <li><a (click)="view_(s)"><span>👁</span> View details</a></li>
                  <li><a [routerLink]="['/students', s.id]"><span>✎</span> Edit</a></li>
                  <li><a (click)="comingSoon('Send reminder')"><span>🔔</span> Send reminder</a></li>
                  <li><a class="text-error" (click)="confirmDelete(s)"><span>🗑</span> Delete</a></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- =============================== PAGINATION =============================== -->
    <div class="flex items-center justify-between mt-4 text-sm flex-wrap gap-2">
      <div class="opacity-60">
        Showing <span class="font-medium">{{ data().length === 0 ? 0 : (page() - 1) * limit + 1 }}</span>
        to <span class="font-medium">{{ rangeEnd() }}</span>
        of <span class="font-medium">{{ total() }}</span> students
      </div>
      <div class="join">
        <button class="btn btn-sm join-item" (click)="goTo(1)" [disabled]="page() === 1">«</button>
        <button class="btn btn-sm join-item" (click)="goTo(page() - 1)" [disabled]="page() === 1">Previous</button>
        <button class="btn btn-sm join-item btn-active">{{ page() }} / {{ totalPages() }}</button>
        <button class="btn btn-sm join-item" (click)="goTo(page() + 1)" [disabled]="page() >= totalPages()">Next</button>
        <button class="btn btn-sm join-item" (click)="goTo(totalPages())" [disabled]="page() >= totalPages()">»</button>
      </div>
    </div>

    <!-- =============================== VIEW MODAL =============================== -->
    <dialog #viewModal class="modal" [class.modal-open]="!!viewing()">
      <div class="modal-box max-w-3xl" *ngIf="viewing() as v">
        <form method="dialog">
          <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" (click)="viewing.set(null)">✕</button>
        </form>
        <div class="flex items-center gap-3 mb-3">
          <div class="avatar placeholder">
            <div class="w-12 h-12 rounded-full" [class]="avatarClass(v)">
              <span class="text-base font-semibold">{{ initials(v.fullName) }}</span>
            </div>
          </div>
          <div>
            <h3 class="font-bold text-lg flex items-center gap-2">
              {{ v.fullName }}
              <span class="badge badge-sm"
                [class.badge-success]="v.status==='ACTIVE'"
                [class.badge-warning]="v.status==='SUSPENDED'"
                [class.badge-ghost]="v.status==='INACTIVE'">{{ v.status }}</span>
            </h3>
            <p class="text-sm opacity-60"><code class="bg-base-200 px-1.5 py-0.5 rounded">{{ v.code }}</code></p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div><span class="opacity-60">Phone:</span> {{ v.phone }}</div>
          <div><span class="opacity-60">Email:</span> {{ v.email || '—' }}</div>
          <div><span class="opacity-60">Gender:</span> {{ v.gender || '—' }}</div>
          <div><span class="opacity-60">Date of birth:</span> {{ (v.dateOfBirth | date:'mediumDate') || '—' }}</div>
          <div><span class="opacity-60">Aadhaar:</span> {{ v.aadhaarNumber || '—' }}</div>
          <div><span class="opacity-60">Voter ID:</span> {{ v.voterId || '—' }}</div>
          <div><span class="opacity-60">Father:</span> {{ v.fatherName || '—' }}</div>
          <div><span class="opacity-60">Mother:</span> {{ v.motherName || '—' }}</div>
          <div><span class="opacity-60">Emergency:</span> {{ v.emergencyContact || '—' }}</div>
          <div><span class="opacity-60">Exam target:</span> {{ v.examTarget || '—' }}</div>
          <div><span class="opacity-60">Registered:</span> {{ v.joinedAt | date:'medium' }}</div>
          <div><span class="opacity-60">Expires:</span> {{ (v.expiresAt | date:'medium') || '—' }}</div>
        </div>

        <div *ngIf="v.activeSeat" class="divider my-3 text-xs">Active seat</div>
        <div *ngIf="v.activeSeat" class="bg-base-200 rounded-lg p-3 text-sm grid grid-cols-2 md:grid-cols-4 gap-2">
          <div><span class="opacity-60">Seat:</span> <code class="bg-base-100 px-1.5 py-0.5 rounded text-xs">{{ v.activeSeat.seatCode }}</code></div>
          <div><span class="opacity-60">Type:</span> {{ v.activeSeat.seatType }}</div>
          <div><span class="opacity-60">Shift:</span> {{ v.activeSeat.shift }}</div>
          <div><span class="opacity-60">Rate:</span> {{ v.activeSeat.monthlyRate ? '₹' + (v.activeSeat.monthlyRate | number) : '—' }}</div>
          <div class="col-span-2"><span class="opacity-60">Next due:</span> {{ v.activeSeat.nextDueDate ? (v.activeSeat.nextDueDate | date:'mediumDate') : '—' }}</div>
          <div class="col-span-2"><span class="opacity-60">Status:</span>
            <span class="badge badge-sm" [class.badge-success]="v.activeSeat.status === 'CONFIRMED'" [class.badge-warning]="v.activeSeat.status === 'TEMPORARY'">{{ v.activeSeat.status }}</span>
          </div>
        </div>

        <div class="divider my-2 text-xs">Address</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <div class="opacity-60 text-xs uppercase tracking-wide mb-1">Permanent</div>
            <div class="whitespace-pre-wrap">{{ v.permanentAddress || '—' }}</div>
          </div>
          <div>
            <div class="opacity-60 text-xs uppercase tracking-wide mb-1">Temporary</div>
            <div class="whitespace-pre-wrap">{{ v.temporaryAddress || '—' }}</div>
          </div>
        </div>

        <div class="modal-action">
          <a class="btn btn-ghost" [routerLink]="['/students', v.id]" (click)="viewing.set(null)">Edit</a>
          <button class="btn" (click)="viewing.set(null)">Close</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button (click)="viewing.set(null)">close</button>
      </form>
    </dialog>

    <!-- =============================== DELETE DIALOG =============================== -->
    <dialog class="modal" [class.modal-open]="!!deleting()">
      <div class="modal-box" *ngIf="deleting() as d">
        <h3 class="font-bold text-lg">Delete student?</h3>
        <p class="py-2">This will permanently remove <strong>{{ d.fullName }}</strong> ({{ d.code }}) along with related attendance and payments via cascade. This cannot be undone.</p>
        <div class="modal-action">
          <button class="btn btn-ghost" (click)="deleting.set(null)">Cancel</button>
          <button class="btn btn-error" (click)="doDelete()" [disabled]="deleting()?.id === deletingId()">
            <span *ngIf="deleting()?.id === deletingId()" class="loading loading-spinner loading-sm"></span>
            Delete
          </button>
        </div>
      </div>
    </dialog>
  `,
})
export class StudentsListComponent implements OnInit {
  private api = inject(StudentsApiService);
  private toast = inject(ToastService);

  data = signal<StudentRow[]>([]);
  total = signal(0);
  page = signal(1);
  limit = 25;
  search = '';
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' | undefined = undefined;
  accomFilter: 'ALL' | 'WITH_SEAT' | 'NO_SEAT' = 'ALL';
  sortBy = signal<SortField>('createdAt');
  sortOrder = signal<'asc' | 'desc'>('desc');
  loading = signal(false);

  dateFrom = '';
  dateTo = '';
  toggleFilters = signal(false);
  view = signal<ViewMode>('list');

  viewing = signal<StudentRow | null>(null);
  deleting = signal<StudentRow | null>(null);
  deletingId = signal<string | null>(null);

  sortOptions: { field: SortField; label: string }[] = [
    { field: 'fullName',  label: 'Name' },
    { field: 'code',      label: 'Code' },
    { field: 'joinedAt',  label: 'Registration date' },
    { field: 'expiresAt', label: 'Expiry date' },
    { field: 'status',    label: 'Status' },
  ];

  sortLabel = computed(() => this.sortOptions.find((o) => o.field === this.sortBy())?.label ?? 'Name');

  private search$ = new Subject<void>();

  ngOnInit() {
    this.search$.pipe(debounceTime(250)).subscribe(() => this.reload());
    this.reload();
  }

  onSearch() { this.page.set(1); this.search$.next(); }
  onPageSizeChange() { this.page.set(1); this.reload(); }
  goTo(p: number) {
    const tp = this.totalPages();
    if (p < 1 || p > tp || p === this.page()) return;
    this.page.set(p);
    this.reload();
  }
  setSort(field: SortField) {
    if (this.sortBy() !== field) {
      this.sortBy.set(field);
      this.sortOrder.set(field === 'fullName' || field === 'code' ? 'asc' : 'desc');
    }
    this.page.set(1);
    this.reload();
    (document.activeElement as HTMLElement | null)?.blur();
  }
  toggleDir() {
    this.sortOrder.set(this.sortOrder() === 'asc' ? 'desc' : 'asc');
    this.reload();
    (document.activeElement as HTMLElement | null)?.blur();
  }

  hasActiveFilters(): boolean {
    return !!this.dateFrom || !!this.dateTo;
  }

  reload() {
    this.loading.set(true);
    this.api.list({
      page: this.page(),
      limit: this.limit,
      search: this.search,
      status: this.status,
      sortBy: this.sortBy(),
      sortOrder: this.sortOrder(),
      dateFrom: this.dateFrom || undefined,
      dateTo: this.dateTo || undefined,
    }).subscribe({
      next: (res) => {
        let rows = res.data;
        // Accommodation filter is applied client-side since it depends on activeSeat which the API
        // already joins for the current page.
        if (this.accomFilter === 'WITH_SEAT') rows = rows.filter((r) => !!r.activeSeat);
        else if (this.accomFilter === 'NO_SEAT') rows = rows.filter((r) => !r.activeSeat);
        this.data.set(rows);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onRangeChange(r: { from: string; to: string }) {
    this.dateFrom = r.from;
    this.dateTo = r.to;
    this.page.set(1);
    this.reload();
  }

  totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / this.limit));
  }
  rangeEnd(): number {
    return Math.min(this.page() * this.limit, this.total());
  }

  view_(s: StudentRow) { this.viewing.set(s); (document.activeElement as HTMLElement | null)?.blur(); }

  confirmDelete(s: StudentRow) { this.deleting.set(s); (document.activeElement as HTMLElement | null)?.blur(); }
  doDelete() {
    const s = this.deleting();
    if (!s) return;
    this.deletingId.set(s.id);
    this.api.remove(s.id).subscribe({
      next: () => {
        this.toast.success(`Deleted ${s.fullName}`);
        this.deleting.set(null);
        this.deletingId.set(null);
        this.reload();
      },
      error: (err) => {
        this.toast.error(err.error?.message ?? 'Delete failed');
        this.deletingId.set(null);
      },
    });
  }

  comingSoon(label: string) {
    (document.activeElement as HTMLElement | null)?.blur();
    this.toast.warning(`${label} — integration coming soon. Contact Support to enable.`);
  }

  initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  }

  avatarClass(s: StudentRow): string {
    // Deterministic color per student so the same name always lands on the same palette slot.
    let h = 0;
    const id = s.id || s.code || s.fullName;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
  }

  seatTypeBadgeClass(t: string): string {
    switch ((t || '').toUpperCase()) {
      case 'CABIN':       return 'badge-success';
      case 'OPEN_DESK':   return 'badge-info';
      case 'PREMIUM':     return 'badge-warning';
      default:            return 'badge-outline';
    }
  }

  paidUntil(s: StudentRow): string | null {
    return s.activeSeat?.nextDueDate ?? s.expiresAt ?? null;
  }

  isExpired(d: string | null): boolean {
    if (!d) return false;
    return new Date(d).getTime() < Date.now();
  }
  isExpiringSoon(d: string | null): boolean {
    if (!d) return false;
    const ms = new Date(d).getTime() - Date.now();
    return ms > 0 && ms < 7 * 24 * 3600 * 1000;
  }

  doExport(kind: 'csv' | 'pdf') {
    this.api.list({
      page: 1,
      limit: 1000,
      search: this.search,
      status: this.status,
      sortBy: this.sortBy(),
      sortOrder: this.sortOrder(),
      dateFrom: this.dateFrom || undefined,
      dateTo: this.dateTo || undefined,
    }).subscribe({
      next: (res) => this.buildExport(res.data, kind),
      error: () => this.toast.error('Could not load students for export'),
    });
  }

  private buildExport(rows: StudentRow[], kind: 'csv' | 'pdf') {
    if (rows.length === 0) {
      this.toast.error('No students match the selected filters');
      return;
    }
    const cols: ExportColumn<StudentRow>[] = [
      { header: 'Code', value: (s) => s.code },
      { header: 'Name', value: (s) => s.fullName },
      { header: 'Phone', value: (s) => s.phone },
      { header: 'Email', value: (s) => s.email ?? '' },
      { header: 'Seat', value: (s) => s.activeSeat?.seatCode ?? '' },
      { header: 'Seat type', value: (s) => s.activeSeat?.seatType ?? '' },
      { header: 'Status', value: (s) => s.status },
      { header: 'Registered', value: (s) => fmtDate(s.joinedAt) },
      { header: 'Paid until', value: (s) => this.paidUntil(s) ? fmtDate(this.paidUntil(s)!) : '' },
    ];
    const f = this.dateFrom ? fmtDate(this.dateFrom) : 'beginning';
    const t = this.dateTo ? fmtDate(this.dateTo) : 'today';
    const subtitle = `Registered: ${f} – ${t}` + (this.status ? ` · ${this.status}` : '');
    const meta = { title: 'Students report', subtitle, fileSlug: 'students' };
    if (kind === 'csv') exportCsv(rows, cols, meta);
    else exportPdf(rows, cols, meta);
    this.toast.success(`Exported ${rows.length} student${rows.length === 1 ? '' : 's'} as ${kind.toUpperCase()}`);
  }
}
