import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ExpensesApiService, Expense, ExpenseStats, ExpenseCategory, CreateExpenseDto, PayExpenseDto,
} from './expenses.service';
import { BranchesApiService, Branch } from '../students/branches.service';
import { StaffApiService, Staff } from '../../core/services/staff.service';
import { VendorsApiService, Vendor } from '../../core/services/vendors.service';
import { ToastService } from '../../core/services/toast.service';

type CategoryFilter = 'ALL' | ExpenseCategory;

interface CategoryOption { value: ExpenseCategory; label: string; icon: string; }

@Component({
  selector: 'lms-expenses',
  standalone: true,
  host: { class: 'flex flex-col h-[calc(100dvh-5.75rem)] min-h-0 overflow-hidden' },
  imports: [CommonModule, FormsModule],
  template: `
    <!-- HEADER -->
    <div class="flex items-end justify-between mb-4 flex-wrap gap-2 shrink-0">
      <div>
        <h1 class="text-2xl font-bold flex items-center gap-2">💰 Expenses</h1>
        <p class="text-sm opacity-60 mt-1">Track operational costs — rent, salaries, utilities, supplies & more</p>
      </div>
      <button class="btn btn-primary btn-sm" (click)="openCreate()">+ Add expense</button>
    </div>

    <!-- STATS -->
    <div class="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3 shrink-0" *ngIf="stats() as s">
      <div class="card bg-base-100 border border-base-300 shadow-sm"><div class="card-body p-3">
        <div class="text-xs opacity-60 uppercase tracking-wider">This month</div>
        <div class="text-2xl font-bold text-primary">₹{{ s.thisMonthAmount | number }}</div>
      </div></div>
      <div class="card bg-base-100 border border-base-300 shadow-sm"><div class="card-body p-3">
        <div class="text-xs opacity-60 uppercase tracking-wider">This month #</div>
        <div class="text-2xl font-bold">{{ s.thisMonthCount }}</div>
      </div></div>
      <div class="card bg-base-100 border border-base-300 shadow-sm"><div class="card-body p-3">
        <div class="text-xs opacity-60 uppercase tracking-wider">All-time spend</div>
        <div class="text-2xl font-bold text-error">₹{{ s.totalAmount | number }}</div>
      </div></div>
      <div class="card bg-base-100 border shadow-sm" [class.border-warning]="s.outstandingCount" [class.border-base-300]="!s.outstandingCount"><div class="card-body p-3">
        <div class="text-xs opacity-60 uppercase tracking-wider">Outstanding</div>
        <div class="text-2xl font-bold" [class.text-warning]="s.outstandingCount" [class.opacity-50]="!s.outstandingCount">₹{{ s.outstandingAmount | number }}</div>
        <div class="text-xs opacity-60" *ngIf="s.outstandingCount">{{ s.outstandingCount }} on credit</div>
      </div></div>
      <div class="card bg-base-100 border border-base-300 shadow-sm"><div class="card-body p-3">
        <div class="text-xs opacity-60 uppercase tracking-wider">Records</div>
        <div class="text-2xl font-bold opacity-70">{{ s.total }}</div>
      </div></div>
      <div class="card bg-base-100 border border-base-300 shadow-sm"><div class="card-body p-3">
        <div class="text-xs opacity-60 uppercase tracking-wider">Top category</div>
        <div class="text-base font-bold truncate" *ngIf="s.topCategory; else noTop">
          {{ categoryLabel(s.topCategory.category) }}
          <span class="opacity-60 text-sm">· ₹{{ s.topCategory.amount | number }}</span>
        </div>
        <ng-template #noTop><div class="text-base font-bold opacity-50">—</div></ng-template>
      </div></div>
    </div>

    <!-- FILTER BAR -->
    <div class="card bg-base-100 border border-base-300 mb-3 shadow-sm shrink-0">
      <div class="card-body p-2 flex flex-row flex-wrap items-center gap-2">
        <label class="input input-bordered input-sm flex items-center gap-2 flex-1 min-w-[180px]">
          <span class="opacity-50">🔍</span>
          <input type="text" class="grow" [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event); page.set(1)" placeholder="Search title, vendor or notes…" />
          <button *ngIf="searchTerm()" class="opacity-60 hover:opacity-100" (click)="searchTerm.set('')" title="Clear">✕</button>
        </label>
        <select class="select select-bordered select-sm" [(ngModel)]="categoryFilterModel" (ngModelChange)="onCategoryFilter($event)">
          <option value="ALL">All categories</option>
          <option *ngFor="let c of categories" [value]="c.value">{{ c.icon }} {{ c.label }}</option>
        </select>
        <select class="select select-bordered select-sm" [(ngModel)]="statusFilterModel" (ngModelChange)="onStatusFilter($event)" title="Filter by payment status">
          <option value="ALL">All statuses</option>
          <option value="CREDIT">⏳ On credit (unpaid)</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PARTIAL">Part-paid</option>
          <option value="PAID">Paid</option>
        </select>
        <select *ngIf="branches().length > 1" class="select select-bordered select-sm" [(ngModel)]="branchFilterModel" (ngModelChange)="onBranchFilter($event)">
          <option value="ALL">All branches</option>
          <option value="NONE">Tenant-wide</option>
          <option *ngFor="let b of branches()" [value]="b.id">{{ b.name }}</option>
        </select>
        <select *ngIf="staff().length" class="select select-bordered select-sm" [(ngModel)]="staffFilterModel" (ngModelChange)="onStaffFilter($event)" title="Filter by staff">
          <option value="ALL">All staff</option>
          <option *ngFor="let s of staff()" [value]="s.id">{{ s.fullName }}</option>
        </select>
        <!-- DATE RANGE -->
        <select class="select select-bordered select-sm" [ngModel]="datePreset()" (ngModelChange)="applyPreset($event)" title="Date range">
          <option value="ALL">All time</option>
          <option value="THIS_MONTH">This month</option>
          <option value="LAST_MONTH">Last month</option>
          <option value="LAST_3_MONTHS">Last 3 months</option>
          <option value="THIS_YEAR">This year</option>
          <option value="CUSTOM">Custom…</option>
        </select>
        <div class="join" *ngIf="datePreset() === 'CUSTOM'">
          <input type="date" class="input input-bordered input-sm join-item" [ngModel]="fromDate()" (ngModelChange)="setFrom($event)" title="From date" />
          <span class="join-item flex items-center px-2 bg-base-200 text-xs opacity-60">to</span>
          <input type="date" class="input input-bordered input-sm join-item" [ngModel]="toDate()" (ngModelChange)="setTo($event)" title="To date" />
        </div>
        <div class="flex-1"></div>
        <button class="btn btn-sm btn-outline gap-1" (click)="exportCsv()" [disabled]="filtered().length === 0" title="Export the filtered rows to CSV">⬇ Export CSV</button>
        <button class="btn btn-sm btn-ghost btn-square" (click)="reload()" title="Refresh">⟳</button>
      </div>
    </div>

    <!-- TABLE -->
    <div class="card bg-base-100 border border-base-300 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
      <div class="overflow-auto flex-1 min-h-0">
        <table class="table">
          <thead class="bg-base-200 sticky top-0 z-10">
            <tr class="text-xs uppercase tracking-wider">
              <th>Date</th>
              <th>Title</th>
              <th>Category</th>
              <th>Branch</th>
              <th>Staff</th>
              <th>Vendor</th>
              <th>Method</th>
              <th>Status</th>
              <th class="text-right">Amount</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let e of paged()" class="hover">
              <td class="text-sm whitespace-nowrap">{{ e.expenseDate | date:'dd/MM/yyyy' }}</td>
              <td>
                <div class="font-semibold">{{ e.title }}</div>
                <div class="text-xs opacity-50 max-w-[16rem] truncate" *ngIf="e.notes">{{ e.notes }}</div>
              </td>
              <td><span class="badge badge-sm badge-outline">{{ categoryIcon(e.category) }} {{ categoryLabel(e.category) }}</span></td>
              <td class="text-sm">{{ e.branch?.name || '—' }}</td>
              <td class="text-sm">{{ e.staff?.fullName || '—' }}</td>
              <td class="text-sm">{{ e.vendor || '—' }}</td>
              <td class="text-sm">{{ e.paymentMethod || '—' }}</td>
              <td>
                <span class="badge badge-sm" [ngClass]="statusBadgeClass(e)">{{ statusLabel(e) }}</span>
                <div class="text-xs mt-0.5" *ngIf="e.paymentStatus !== 'PAID'">
                  <span class="text-warning font-medium">₹{{ e.outstanding | number }} due</span>
                  <span class="opacity-50" *ngIf="e.dueDate"> · {{ e.dueDate | date:'dd/MM/yy' }}</span>
                </div>
              </td>
              <td class="text-right font-semibold">₹{{ e.amount | number }}</td>
              <td class="text-right">
                <div class="flex items-center justify-end gap-1">
                  <button *ngIf="e.paymentStatus !== 'PAID'" class="btn btn-ghost btn-xs text-success" (click)="openPay(e)" title="Record a payment">💵</button>
                  <button class="btn btn-ghost btn-xs" (click)="openEdit(e)" title="Edit">✎</button>
                  <button class="btn btn-ghost btn-xs text-error" (click)="confirmDelete(e)" title="Delete">🗑</button>
                </div>
              </td>
            </tr>
            <tr *ngIf="filtered().length === 0 && !loading()">
              <td colspan="10" class="text-center opacity-60 py-10">
                <div class="text-base mb-1">No expenses match your filters.</div>
                <button class="link link-primary text-sm" (click)="openCreate()">Add your first expense →</button>
              </td>
            </tr>
            <tr *ngIf="loading()"><td colspan="10" class="text-center py-6"><span class="loading loading-spinner loading-md"></span></td></tr>
          </tbody>
          <tfoot *ngIf="filtered().length > 0">
            <tr class="bg-base-200 font-semibold">
              <td colspan="7" class="text-right text-xs uppercase opacity-60">Total (filtered)</td>
              <td class="text-right text-xs">
                <span *ngIf="filteredOutstanding() > 0" class="text-warning">₹{{ filteredOutstanding() | number }} due</span>
              </td>
              <td class="text-right">₹{{ filteredTotal() | number }}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- PAGINATION -->
    <div class="flex items-center justify-between pt-3 text-sm flex-wrap gap-2 shrink-0">
      <div class="opacity-60">
        Showing <span class="font-medium">{{ filtered().length === 0 ? 0 : (page() - 1) * pageSize + 1 }}</span>
        to <span class="font-medium">{{ rangeEnd() }}</span>
        of <span class="font-medium">{{ filtered().length }}</span> expenses
      </div>
      <div class="join">
        <button class="btn btn-sm join-item" (click)="page.set(1)" [disabled]="page() === 1">«</button>
        <button class="btn btn-sm join-item" (click)="goTo(page() - 1)" [disabled]="page() === 1">Previous</button>
        <button class="btn btn-sm join-item btn-active">{{ page() }} / {{ totalPages() }}</button>
        <button class="btn btn-sm join-item" (click)="goTo(page() + 1)" [disabled]="page() >= totalPages()">Next</button>
        <button class="btn btn-sm join-item" (click)="goTo(totalPages())" [disabled]="page() >= totalPages()">»</button>
      </div>
    </div>

    <!-- ============ CREATE / EDIT MODAL ============ -->
    <dialog class="modal" [class.modal-open]="editorOpen()">
      <div class="modal-box max-w-2xl">
        <form method="dialog"><button type="button" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" (click)="closeEditor()">✕</button></form>
        <h3 class="font-bold text-lg">{{ editingId() ? '✎ Edit expense' : '+ Add expense' }}</h3>
        <p class="text-sm opacity-60 mb-3">Track an operational cost — rent, salary, utilities, supplies & more.</p>

        <div class="space-y-3">
          <label class="form-control">
            <div class="label py-0.5"><span class="label-text text-sm">Title *</span></div>
            <input class="input input-bordered input-sm" [(ngModel)]="form.title" placeholder="e.g. April shop rent" />
          </label>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label class="form-control sm:col-span-2">
              <div class="label py-0.5"><span class="label-text text-sm">Category *</span></div>
              <select class="select select-bordered select-sm" [(ngModel)]="form.category">
                <option *ngFor="let c of categories" [value]="c.value">{{ c.icon }} {{ c.label }}</option>
              </select>
            </label>
            <label class="form-control">
              <div class="label py-0.5"><span class="label-text text-sm">Amount (₹) *</span></div>
              <input class="input input-bordered input-sm" type="number" min="0" step="0.01" [(ngModel)]="form.amount" placeholder="0" />
            </label>
            <label class="form-control">
              <div class="label py-0.5"><span class="label-text text-sm">Date *</span></div>
              <input class="input input-bordered input-sm" type="date" [(ngModel)]="form.expenseDate" />
            </label>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="form-control">
              <div class="label py-0.5"><span class="label-text text-sm">Branch</span></div>
              <select class="select select-bordered select-sm" [(ngModel)]="form.branchId">
                <option value="">Tenant-wide (no branch)</option>
                <option *ngFor="let b of branches()" [value]="b.id">{{ b.name }} ({{ b.code }})</option>
              </select>
            </label>
            <label class="form-control">
              <div class="label py-0.5"><span class="label-text text-sm">Payment method</span></div>
              <select class="select select-bordered select-sm" [(ngModel)]="form.paymentMethod">
                <option value="">—</option>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="NETBANKING">Bank transfer</option>
                <option value="CARD">Card</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </label>
            <label class="form-control">
              <div class="label py-0.5 justify-between">
                <span class="label-text text-sm">Vendor / paid to</span>
                <button type="button" class="btn btn-ghost btn-xs text-primary" (click)="openAddVendor()">+ Add new</button>
              </div>
              <select class="select select-bordered select-sm" [(ngModel)]="form.vendor">
                <option value="">— None —</option>
                <option *ngFor="let v of vendors()" [value]="v.name">{{ v.name }}</option>
                <!-- Preserve a legacy free-text vendor not in the master list -->
                <option *ngIf="form.vendor && !vendorExists(form.vendor)" [value]="form.vendor">{{ form.vendor }}</option>
              </select>
              <div class="label py-0.5" *ngIf="!editingId() && selectedVendorAdvance() > 0">
                <span class="label-text-alt text-xs text-success">₹{{ selectedVendorAdvance() | number }} advance available — auto-applied to this expense</span>
              </div>
            </label>
            <label class="form-control" *ngIf="staff().length">
              <div class="label py-0.5"><span class="label-text text-sm">Staff member</span></div>
              <select class="select select-bordered select-sm" [(ngModel)]="form.staffId">
                <option value="">— None —</option>
                <option *ngFor="let s of staff()" [value]="s.id">{{ s.fullName }}</option>
              </select>
            </label>
          </div>

          <!-- PAID vs ON CREDIT -->
          <div class="rounded-lg border border-base-300 p-3 bg-base-200/40">
            <div class="join w-full">
              <input type="radio" name="payMode" class="join-item btn btn-sm flex-1" aria-label="✓ Paid in full" [checked]="!form.onCredit" (change)="setPayMode(false)" />
              <input type="radio" name="payMode" class="join-item btn btn-sm flex-1" aria-label="⏳ On credit (pay later)" [checked]="form.onCredit" (change)="setPayMode(true)" />
            </div>
            <p class="text-xs opacity-60 mt-2">{{ form.onCredit ? 'Record the cost now and settle the balance later — a due date and any up-front payment are optional.' : 'The full amount has been paid.' }}</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3" *ngIf="form.onCredit">
              <label class="form-control">
                <div class="label py-0.5"><span class="label-text text-sm">Paid up-front (₹)</span></div>
                <input class="input input-bordered input-sm" type="number" min="0" step="0.01" [max]="form.amount || null" [(ngModel)]="form.paidAmount" placeholder="0" />
                <div class="label py-0.5"><span class="label-text-alt text-xs text-warning">Outstanding: ₹{{ creditOutstanding() | number }}</span></div>
              </label>
              <label class="form-control">
                <div class="label py-0.5"><span class="label-text text-sm">Due date</span></div>
                <input class="input input-bordered input-sm" type="date" [(ngModel)]="form.dueDate" />
              </label>
            </div>
          </div>

          <label class="form-control">
            <div class="label py-0.5"><span class="label-text text-sm">Notes (optional)</span></div>
            <input class="input input-bordered input-sm" [(ngModel)]="form.notes" placeholder="Any extra detail…" />
          </label>
        </div>

        <div class="modal-action mt-3">
          <button class="btn btn-ghost btn-sm" (click)="closeEditor()">Cancel</button>
          <button class="btn btn-primary btn-sm" [disabled]="busy() || !isValid()" (click)="save()">
            <span *ngIf="busy()" class="loading loading-spinner loading-sm"></span>
            {{ editingId() ? 'Save changes' : 'Add expense' }}
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="closeEditor()">close</button></form>
    </dialog>

    <!-- ============ DELETE CONFIRM ============ -->
    <dialog class="modal" [class.modal-open]="!!deleting()">
      <div class="modal-box max-w-sm" *ngIf="deleting() as e">
        <h3 class="font-bold text-lg">Delete expense?</h3>
        <p class="py-2 text-sm">Permanently remove <strong>{{ e.title }}</strong> (₹{{ e.amount | number }}). This can't be undone.</p>
        <div class="modal-action">
          <button class="btn btn-ghost" (click)="deleting.set(null)">Cancel</button>
          <button class="btn btn-error" [disabled]="busy()" (click)="doDelete()">
            <span *ngIf="busy()" class="loading loading-spinner loading-sm"></span> Delete
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="deleting.set(null)">close</button></form>
    </dialog>

    <!-- ============ PAY CREDIT EXPENSE ============ -->
    <dialog class="modal" [class.modal-open]="!!paying()">
      <div class="modal-box max-w-md" *ngIf="paying() as e">
        <form method="dialog"><button type="button" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" (click)="paying.set(null)">✕</button></form>
        <h3 class="font-bold text-lg">₹ Record payment</h3>
        <p class="text-sm opacity-60 mb-3">Settling <strong>{{ e.title }}</strong> — outstanding <span class="text-warning font-semibold">₹{{ e.outstanding | number }}</span> of ₹{{ e.amount | number }}.</p>

        <!-- PAYMENT HISTORY (prior partial payments) -->
        <div class="rounded-lg bg-base-200/60 p-2 mb-3 text-sm" *ngIf="e.payments?.length">
          <div class="text-xs uppercase tracking-wider opacity-60 mb-1">Payments so far</div>
          <div class="space-y-1 max-h-32 overflow-auto">
            <div class="flex items-center gap-2" *ngFor="let p of e.payments">
              <span class="opacity-60 whitespace-nowrap">{{ p.paidDate | date:'dd/MM/yy' }}</span>
              <span class="font-medium">₹{{ p.amount | number }}</span>
              <span class="badge badge-ghost badge-xs" *ngIf="p.paymentMethod">{{ p.paymentMethod }}</span>
              <span class="opacity-60 truncate" *ngIf="p.notes">· {{ p.notes }}</span>
            </div>
          </div>
          <div class="text-xs opacity-60 mt-1 pt-1 border-t border-base-300">Paid ₹{{ e.paidAmount | number }} of ₹{{ e.amount | number }}</div>
        </div>

        <div class="space-y-3">
          <label class="form-control">
            <div class="label py-0.5"><span class="label-text text-sm">Amount paid now (₹) *</span></div>
            <input class="input input-bordered input-sm" type="number" min="0.01" [max]="e.outstanding" step="0.01" [(ngModel)]="payForm.amount" />
            <div class="label py-0.5"><button type="button" class="label-text-alt link link-primary text-xs" (click)="payForm.amount = e.outstanding">Pay full balance (₹{{ e.outstanding | number }})</button></div>
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="form-control">
              <div class="label py-0.5"><span class="label-text text-sm">Method</span></div>
              <select class="select select-bordered select-sm" [(ngModel)]="payForm.paymentMethod">
                <option value="">—</option>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="NETBANKING">Bank transfer</option>
                <option value="CARD">Card</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </label>
            <label class="form-control">
              <div class="label py-0.5"><span class="label-text text-sm">Paid on</span></div>
              <input class="input input-bordered input-sm" type="date" [(ngModel)]="payForm.paidDate" />
            </label>
          </div>
          <label class="form-control">
            <div class="label py-0.5"><span class="label-text text-sm">Notes (optional)</span></div>
            <input class="input input-bordered input-sm" [(ngModel)]="payForm.notes" placeholder="e.g. cleared via UPI ref 1234" />
          </label>
        </div>

        <div class="modal-action mt-3">
          <button class="btn btn-ghost btn-sm" (click)="paying.set(null)">Cancel</button>
          <button class="btn btn-success btn-sm" [disabled]="busy() || !payValid(e)" (click)="doPay()">
            <span *ngIf="busy()" class="loading loading-spinner loading-sm"></span> Record payment
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="paying.set(null)">close</button></form>
    </dialog>

    <!-- ============ QUICK-ADD VENDOR ============ -->
    <dialog class="modal" [class.modal-open]="addingVendor()">
      <div class="modal-box max-w-sm">
        <form method="dialog"><button type="button" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" (click)="closeAddVendor()">✕</button></form>
        <h3 class="font-bold text-lg">Add a vendor</h3>
        <p class="text-sm opacity-60 mt-1">Adds to your vendor list. Manage full details under Settings → Vendors.</p>
        <label class="form-control mt-4">
          <div class="label py-1"><span class="label-text text-sm">Vendor name *</span></div>
          <input class="input input-bordered input-sm" [(ngModel)]="newVendorName" placeholder="e.g. Landlord, Electricity board"
                 (keydown.enter)="submitNewVendor(); $event.preventDefault()" />
        </label>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost btn-sm" (click)="closeAddVendor()">Cancel</button>
          <button type="button" class="btn btn-primary btn-sm" [disabled]="!newVendorName.trim() || addingVendorLoading()" (click)="submitNewVendor()">
            <span *ngIf="addingVendorLoading()" class="loading loading-spinner loading-sm"></span> Add
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="closeAddVendor()">close</button></form>
    </dialog>
  `,
})
export class ExpensesComponent implements OnInit {
  private api = inject(ExpensesApiService);
  private branchesApi = inject(BranchesApiService);
  private staffApi = inject(StaffApiService);
  private vendorsApi = inject(VendorsApiService);
  private toast = inject(ToastService);

  data = signal<Expense[]>([]);
  stats = signal<ExpenseStats | null>(null);
  branches = signal<Branch[]>([]);
  staff = signal<Staff[]>([]);
  vendors = signal<Vendor[]>([]);
  loading = signal(false);
  busy = signal(false);

  // quick-add vendor (inline, mirrors the exam-target add on the student form)
  addingVendor = signal(false);
  addingVendorLoading = signal(false);
  newVendorName = '';

  searchTerm = signal('');
  categoryFilter = signal<CategoryFilter>('ALL');
  categoryFilterModel: CategoryFilter = 'ALL';
  branchFilter = signal<'ALL' | 'NONE' | string>('ALL');
  branchFilterModel: 'ALL' | 'NONE' | string = 'ALL';
  staffFilter = signal<'ALL' | string>('ALL');
  staffFilterModel: 'ALL' | string = 'ALL';
  // 'CREDIT' = any unpaid balance (UNPAID + PARTIAL); the rest map to a single status.
  statusFilter = signal<'ALL' | 'CREDIT' | 'PAID' | 'PARTIAL' | 'UNPAID'>('ALL');
  statusFilterModel: 'ALL' | 'CREDIT' | 'PAID' | 'PARTIAL' | 'UNPAID' = 'ALL';

  // Date range — preset drives from/to; 'CUSTOM' lets the user pick freely.
  datePreset = signal<'ALL' | 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3_MONTHS' | 'THIS_YEAR' | 'CUSTOM'>('ALL');
  fromDate = signal('');
  toDate = signal('');

  categories: CategoryOption[] = [
    { value: 'RENT',        label: 'Rent',        icon: '🏠' },
    { value: 'SALARY',      label: 'Salary',      icon: '👤' },
    { value: 'ELECTRICITY', label: 'Electricity', icon: '⚡' },
    { value: 'WATER',       label: 'Water',       icon: '💧' },
    { value: 'INTERNET',    label: 'Internet',    icon: '🌐' },
    { value: 'MAINTENANCE', label: 'Maintenance', icon: '🔧' },
    { value: 'SUPPLIES',    label: 'Supplies',    icon: '📦' },
    { value: 'EQUIPMENT',   label: 'Equipment',   icon: '🖥' },
    { value: 'MARKETING',   label: 'Marketing',   icon: '📣' },
    { value: 'MISC',        label: 'Misc',        icon: '🧾' },
  ];

  // editor (create + edit share one form)
  editorOpen = signal(false);
  editingId = signal<string | null>(null);
  deleting = signal<Expense | null>(null);
  form: CreateExpenseDto = this.blankForm();

  // pay-a-credit-expense modal
  paying = signal<Expense | null>(null);
  payForm: PayExpenseDto = { amount: 0, paymentMethod: '', paidDate: '', notes: '' };

  // pagination
  page = signal(1);
  pageSize = 12;

  filtered = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const cf = this.categoryFilter();
    const bf = this.branchFilter();
    const sf = this.staffFilter();
    const pf = this.statusFilter();
    const from = this.fromDate() ? new Date(this.fromDate() + 'T00:00:00').getTime() : null;
    const to = this.toDate() ? new Date(this.toDate() + 'T23:59:59.999').getTime() : null;
    return this.data().filter((e) => {
      if (cf !== 'ALL' && e.category !== cf) return false;
      if (bf === 'NONE' && e.branchId) return false;
      if (bf !== 'ALL' && bf !== 'NONE' && e.branchId !== bf) return false;
      if (sf !== 'ALL' && e.staffId !== sf) return false;
      if (pf === 'CREDIT' && e.paymentStatus === 'PAID') return false;
      if (pf !== 'ALL' && pf !== 'CREDIT' && e.paymentStatus !== pf) return false;
      const t = new Date(e.expenseDate).getTime();
      if (from !== null && t < from) return false;
      if (to !== null && t > to) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.vendor ?? '').toLowerCase().includes(q) ||
        (e.notes ?? '').toLowerCase().includes(q)
      );
    });
  });

  filteredTotal = computed(() => this.filtered().reduce((sum, e) => sum + Number(e.amount ?? 0), 0));
  filteredOutstanding = computed(() => this.filtered().reduce((sum, e) => sum + Number(e.outstanding ?? 0), 0));
  totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  paged = computed(() => {
    const p = Math.min(this.page(), this.totalPages());
    const start = (p - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });

  ngOnInit() {
    this.reload();
    this.branchesApi.list().subscribe({ next: (bs) => this.branches.set(bs), error: () => {} });
    this.staffApi.list(true).subscribe({ next: (st) => this.staff.set(st), error: () => {} });
    this.loadVendors();
  }

  loadVendors() {
    this.vendorsApi.list(true).subscribe({ next: (v) => this.vendors.set(v), error: () => {} });
  }

  vendorExists(name: string): boolean {
    return this.vendors().some((v) => v.name === name);
  }

  /** Advance wallet balance of the currently-selected vendor (0 if none). */
  selectedVendorAdvance(): number {
    return this.vendors().find((v) => v.name === this.form.vendor)?.advanceBalance ?? 0;
  }

  // ----- quick-add vendor (inline) -----
  openAddVendor() { this.newVendorName = ''; this.addingVendor.set(true); this.blur(); }
  closeAddVendor() { this.addingVendor.set(false); this.addingVendorLoading.set(false); }
  submitNewVendor() {
    const name = this.newVendorName.trim();
    if (!name) return;
    this.addingVendorLoading.set(true);
    this.vendorsApi.create({ name }).subscribe({
      next: (created) => {
        this.vendors.update((arr) => [...arr, created].sort((a, b) => a.name.localeCompare(b.name)));
        this.form.vendor = created.name;          // auto-select the new vendor
        this.toast.success(`Added vendor "${created.name}"`);
        this.closeAddVendor();
      },
      error: (err) => {
        const msg = err?.error?.message;
        this.toast.error(Array.isArray(msg) ? msg.join(' · ') : (msg ?? 'Could not add vendor'));
        this.addingVendorLoading.set(false);
      },
    });
  }

  goTo(p: number) {
    const tp = this.totalPages();
    if (p < 1 || p > tp || p === this.page()) return;
    this.page.set(p);
  }
  rangeEnd(): number { return Math.min(this.page() * this.pageSize, this.filtered().length); }

  onCategoryFilter(v: CategoryFilter) { this.categoryFilter.set(v); this.page.set(1); }
  onBranchFilter(v: 'ALL' | 'NONE' | string) { this.branchFilter.set(v); this.page.set(1); }
  onStaffFilter(v: 'ALL' | string) { this.staffFilter.set(v); this.page.set(1); }
  onStatusFilter(v: 'ALL' | 'CREDIT' | 'PAID' | 'PARTIAL' | 'UNPAID') { this.statusFilter.set(v); this.page.set(1); }

  setFrom(v: string) { this.fromDate.set(v); this.page.set(1); }
  setTo(v: string) { this.toDate.set(v); this.page.set(1); }

  /** Translate a preset into concrete from/to bounds (local time, no TZ shift). */
  applyPreset(p: 'ALL' | 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3_MONTHS' | 'THIS_YEAR' | 'CUSTOM') {
    this.datePreset.set(p);
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (p === 'ALL')                { this.fromDate.set(''); this.toDate.set(''); }
    else if (p === 'THIS_MONTH')    { this.fromDate.set(iso(new Date(y, m, 1)));     this.toDate.set(iso(new Date(y, m + 1, 0))); }
    else if (p === 'LAST_MONTH')    { this.fromDate.set(iso(new Date(y, m - 1, 1))); this.toDate.set(iso(new Date(y, m, 0))); }
    else if (p === 'LAST_3_MONTHS') { this.fromDate.set(iso(new Date(y, m - 2, 1))); this.toDate.set(iso(new Date(y, m + 1, 0))); }
    else if (p === 'THIS_YEAR')     { this.fromDate.set(iso(new Date(y, 0, 1)));     this.toDate.set(iso(new Date(y, 11, 31))); }
    // CUSTOM: keep whatever from/to are currently set so the user picks freely.
    this.page.set(1);
  }

  /** Export the currently-filtered rows to a CSV file (with a BOM so Excel renders ₹/UTF-8). */
  exportCsv() {
    const rows = this.filtered();
    if (!rows.length) return;
    const headers = ['Date', 'Title', 'Category', 'Branch', 'Staff', 'Vendor', 'Method', 'Status', 'Amount', 'Paid', 'Outstanding', 'Due date', 'Notes'];
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = rows.map((e) => [
      new Date(e.expenseDate).toLocaleDateString('en-IN'),
      e.title,
      this.categoryLabel(e.category),
      e.branch?.name ?? 'Tenant-wide',
      e.staff?.fullName ?? '',
      e.vendor ?? '',
      e.paymentMethod ?? '',
      this.statusLabel(e),
      e.amount,
      e.paidAmount,
      e.outstanding,
      e.dueDate ? new Date(e.dueDate).toLocaleDateString('en-IN') : '',
      e.notes ?? '',
    ].map(esc).join(','));
    const total = rows.reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const totalOut = rows.reduce((s, e) => s + Number(e.outstanding ?? 0), 0);
    body.push(['', '', '', '', '', '', '', 'TOTAL', total, '', totalOut, '', ''].map(esc).join(','));

    const csv = '﻿' + [headers.join(','), ...body].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const range = (this.fromDate() || this.toDate())
      ? `_${this.fromDate() || 'start'}_to_${this.toDate() || 'now'}` : '';
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses${range}_${this.todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.success(`Exported ${rows.length} expense(s) to CSV`);
  }

  reload() {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (rows) => { this.data.set(rows); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.error('Could not load expenses'); },
    });
    this.api.stats().subscribe({ next: (s) => this.stats.set(s), error: () => {} });
  }

  categoryLabel(c: ExpenseCategory): string { return this.categories.find((x) => x.value === c)?.label ?? c; }
  categoryIcon(c: ExpenseCategory): string { return this.categories.find((x) => x.value === c)?.icon ?? '🧾'; }

  // ----- credit / payment status -----
  statusLabel(e: Expense): string {
    if (e.paymentStatus === 'PAID') return 'Paid';
    if (e.paymentStatus === 'PARTIAL') return 'Part-paid';
    return 'Unpaid';
  }
  statusBadgeClass(e: Expense): string {
    if (e.paymentStatus === 'PAID') return 'badge-success badge-outline';
    if (e.paymentStatus === 'PARTIAL') return 'badge-warning';
    return 'badge-error';
  }
  /** Live outstanding shown beside the "paid up-front" field in the editor. */
  creditOutstanding(): number {
    return Math.max(0, (Number(this.form.amount) || 0) - (Number(this.form.paidAmount) || 0));
  }
  /** Switch between "paid in full" and "on credit"; clear the credit fields when paid. */
  setPayMode(onCredit: boolean) {
    this.form.onCredit = onCredit;
    if (!onCredit) { this.form.paidAmount = 0; this.form.dueDate = ''; }
  }

  // ----- pay a credit expense -----
  openPay(e: Expense) {
    this.paying.set(e);
    this.payForm = { amount: e.outstanding, paymentMethod: e.paymentMethod ?? '', paidDate: this.todayIso(), notes: '' };
    this.blur();
  }
  payValid(e: Expense): boolean {
    const a = Number(this.payForm.amount);
    return a > 0 && a <= e.outstanding + 0.001;
  }
  doPay() {
    const e = this.paying(); if (!e || !this.payValid(e)) return;
    const payload: PayExpenseDto = {
      amount: Number(this.payForm.amount),
      paymentMethod: this.payForm.paymentMethod || undefined,
      paidDate: this.payForm.paidDate || undefined,
      notes: this.payForm.notes?.trim() || undefined,
    };
    this.busy.set(true);
    this.api.pay(e.id, payload).subscribe({
      next: () => { this.toast.success('Payment recorded'); this.afterAction(() => this.paying.set(null)); },
      error: (err) => this.fail(err, 'Could not record payment'),
    });
  }

  // ----- editor -----
  openCreate() {
    this.editingId.set(null);
    this.form = this.blankForm();
    this.editorOpen.set(true);
    this.blur();
  }
  openEdit(e: Expense) {
    this.editingId.set(e.id);
    this.form = {
      title: e.title,
      category: e.category,
      amount: e.amount,
      expenseDate: (e.expenseDate ?? '').slice(0, 10),
      branchId: e.branchId ?? '',
      paymentMethod: e.paymentMethod ?? '',
      vendor: e.vendor ?? '',
      staffId: e.staffId ?? '',
      notes: e.notes ?? '',
      onCredit: e.paymentStatus !== 'PAID',
      paidAmount: e.paidAmount ?? 0,
      dueDate: (e.dueDate ?? '').slice(0, 10),
    };
    this.editorOpen.set(true);
    this.blur();
  }
  closeEditor() { this.editorOpen.set(false); }

  isValid(): boolean {
    return !!this.form.title?.trim() && !!this.form.category && Number(this.form.amount) >= 0 && !!this.form.expenseDate;
  }

  save() {
    if (!this.isValid()) return;
    const id = this.editingId();
    const payload: CreateExpenseDto = {
      title: this.form.title.trim(),
      category: this.form.category,
      amount: Number(this.form.amount),
      expenseDate: this.form.expenseDate,
      branchId: this.form.branchId || undefined,
      paymentMethod: this.form.paymentMethod || undefined,
      vendor: this.form.vendor?.trim() || undefined,
      // Map the selected vendor name to its id so the API can draw down its advance wallet.
      vendorId: this.vendors().find((v) => v.name === this.form.vendor)?.id || undefined,
      // On create, omit when empty (the API validates staffId as a UUID).
      // On edit, send '' so the API clears a previously-set attribution.
      staffId: this.form.staffId || (id ? '' : undefined),
      notes: this.form.notes?.trim() || undefined,
      onCredit: !!this.form.onCredit,
      paidAmount: this.form.onCredit ? Math.min(Number(this.form.paidAmount) || 0, Number(this.form.amount)) : undefined,
      // On edit, send '' to clear a due date the API previously had; on create omit when unset.
      dueDate: this.form.onCredit ? (this.form.dueDate || (id ? '' : undefined)) : (id ? '' : undefined),
    };
    this.busy.set(true);
    const req = id ? this.api.update(id, payload) : this.api.create(payload);
    req.subscribe({
      next: () => {
        this.toast.success(id ? 'Expense updated' : 'Expense added');
        this.afterAction(() => this.editorOpen.set(false));
      },
      error: (e) => this.fail(e, 'Could not save expense'),
    });
  }

  confirmDelete(e: Expense) { this.deleting.set(e); this.blur(); }
  doDelete() {
    const e = this.deleting(); if (!e) return;
    this.busy.set(true);
    this.api.remove(e.id).subscribe({
      next: () => { this.toast.success('Expense deleted'); this.afterAction(() => this.deleting.set(null)); },
      error: (err) => this.fail(err, 'Could not delete expense'),
    });
  }

  private afterAction(close: () => void) { this.busy.set(false); close(); this.reload(); }
  private fail(err: any, fallback: string) {
    this.busy.set(false);
    const msg = err?.error?.message;
    this.toast.error(Array.isArray(msg) ? msg.join(' · ') : (msg ?? fallback));
  }

  staffName(id: string | null): string {
    if (!id) return '—';
    return this.staff().find((s) => s.id === id)?.fullName ?? '—';
  }

  private blankForm(): CreateExpenseDto {
    return {
      title: '', category: 'MISC', amount: 0, expenseDate: this.todayIso(),
      branchId: '', paymentMethod: '', vendor: '', staffId: '', notes: '',
      onCredit: false, paidAmount: 0, dueDate: '',
    };
  }
  private blur() { (document.activeElement as HTMLElement | null)?.blur(); }
  private todayIso(): string { return new Date().toISOString().slice(0, 10); }
}
