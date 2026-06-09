import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, debounceTime } from 'rxjs';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { PaymentsApiService, PaymentRow, PaymentSummary } from './payments.service';
import { PaymentMethod, Student } from '@lms/shared';
import { StudentsApiService } from '../students/students.service';
import { BranchesApiService, Branch } from '../students/branches.service';
import { ToastService } from '../../core/services/toast.service';
import {
  SearchableSelectComponent, ComboItem,
} from '../../shared/components/searchable-select.component';
import { ExportToolbarComponent } from '../../shared/components/export-toolbar.component';
import { ExportColumn, exportCsv, exportPdf, fmtDate, fmtDateTime } from '../../shared/utils/export.util';
import { printPaymentReceipt, receiptNumber } from '../../shared/utils/receipt.util';
import { AuthService } from '../../core/services/auth.service';

const METHODS: PaymentMethod[] = [
  PaymentMethod.CASH, PaymentMethod.UPI, PaymentMethod.CARD,
  PaymentMethod.NETBANKING, PaymentMethod.RAZORPAY, PaymentMethod.OTHER,
];

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash', UPI: 'UPI (GPay / PhonePe / Paytm)', CARD: 'Card',
  NETBANKING: 'Net banking', RAZORPAY: 'Razorpay link', OTHER: 'Other',
};

// What the payment is for — prefixes the notes with a tag so Reports → "Income by
// source" can split collections. Matches the tags the registration form already writes.
type PaymentSource = 'CABIN' | 'PG' | 'TIFFIN' | 'GENERAL';
const SOURCES: { value: PaymentSource; label: string }[] = [
  { value: 'CABIN',   label: 'Cabin / Seat' },
  { value: 'PG',      label: 'PG Room' },
  { value: 'TIFFIN',  label: 'Tiffin' },
  { value: 'GENERAL', label: 'General / Other' },
];
const SOURCE_TAG: Record<PaymentSource, string> = {
  CABIN: '[Cabin]', PG: '[PG]', TIFFIN: '[Tiffin]', GENERAL: '',
};

@Component({
  selector: 'lms-payments',
  standalone: true,
  host: { class: 'flex flex-col h-[calc(100dvh-5.75rem)] min-h-0 overflow-hidden' },
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent, ExportToolbarComponent],
  template: `
    <div class="flex items-end justify-between mb-4 flex-wrap gap-2 shrink-0">
      <div>
        <h1 class="text-2xl font-bold">Payments</h1>
        <p class="text-sm opacity-60">
          Record cash, UPI, and gateway payments. Allocations auto-confirm at ≥ 50% paid.
          <span *ngIf="total() > 0"> · {{ total() }} record{{ total() === 1 ? '' : 's' }}</span>
        </p>
      </div>
      <button class="btn btn-primary btn-sm" (click)="openRecordModal()">+ Record payment</button>
    </div>

    <!-- Filter / search / sort bar -->
    <div class="card bg-base-100 border border-base-300 shadow-sm mb-3 shrink-0">
      <div class="p-2 flex flex-row flex-wrap items-center gap-2">
        <label class="input input-bordered input-sm flex items-center gap-2 flex-1 min-w-[220px]">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input class="grow" [(ngModel)]="search" (ngModelChange)="onSearch()" placeholder="Search by student name, code, or phone…" />
          <button *ngIf="search" class="opacity-60 hover:opacity-100 px-1" (click)="search=''; onSearch()">✕</button>
        </label>
        <select class="select select-bordered select-sm" [ngModel]="sortKey()" (ngModelChange)="setSort($event)">
          <option value="date-desc">Newest first</option>
          <option value="date-asc">Oldest first</option>
          <option value="amount-desc">Amount (high→low)</option>
          <option value="amount-asc">Amount (low→high)</option>
          <option value="student-asc">Student (A→Z)</option>
        </select>
        <lms-export-toolbar
          [dateFrom]="dateFrom"
          [dateTo]="dateTo"
          (rangeChange)="onRangeChange($event)"
          (exportRequested)="doExport($event)">
        </lms-export-toolbar>
      </div>
    </div>

    <div class="card bg-base-100 border border-base-300 overflow-hidden flex flex-col flex-1 min-h-0">
      <div class="overflow-auto flex-1 min-h-0">
        <table class="table table-zebra">
          <thead class="sticky top-0 z-10 bg-base-100">
            <tr>
              <th>Date</th>
              <th>Receipt #</th>
              <th>Student</th>
              <th class="text-right">Amount</th>
              <th class="text-right">Balance</th>
              <th>Method</th>
              <th>Notes</th>
              <th>Status</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let p of rows()">
              <td class="text-sm">{{ (p.paidAt || p.createdAt) | date:'medium' }}</td>
              <td>
                <code class="text-xs bg-base-200 px-1.5 py-0.5 rounded">{{ receiptNo(p) }}</code>
              </td>
              <td>
                <div class="font-medium">{{ p.student.fullName }}</div>
                <div class="opacity-60 text-xs">{{ p.student.code }} · {{ p.student.phone }}</div>
              </td>
              <td class="text-right font-medium">
                ₹{{ p.amount | number }}
                <div *ngIf="(p.discount ?? 0) > 0" class="text-xs font-normal text-warning" [title]="p.discountReason || 'Discount'">−₹{{ p.discount | number }} disc</div>
              </td>
              <td class="text-right" [class.text-error]="(p.balance ?? 0) > 0" [class.opacity-50]="(p.balance ?? 0) === 0">
                {{ p.monthlyFee ? ('₹' + (p.balance | number)) : '—' }}
              </td>
              <td><span class="badge badge-outline badge-sm">{{ labelFor(p.method) }}</span></td>
              <td class="text-sm opacity-70 max-w-xs truncate" [title]="p.notes ?? ''">{{ p.notes || '—' }}</td>
              <td>
                <span class="badge badge-sm"
                  [class.badge-success]="p.status === 'PAID'"
                  [class.badge-warning]="p.status === 'PENDING'"
                  [class.badge-error]="p.status === 'FAILED'"
                  [class.badge-ghost]="p.status === 'REFUNDED'">
                  {{ p.status }}
                </span>
              </td>
              <td class="text-right">
                <div class="dropdown dropdown-end">
                  <div tabindex="0" role="button" class="btn btn-ghost btn-sm btn-square">
                    <span class="text-lg leading-none">⋯</span>
                  </div>
                  <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-30 w-52 p-2 border border-base-300">
                    <li><a (click)="openDetail(p)"><span>👁</span> View details</a></li>
                    <li><a (click)="printReceipt(p)"><span>🧾</span> Print receipt</a></li>
                    <li class="menu-title text-xs">Send receipt</li>
                    <li><a (click)="sendVia(p, 'email')"><span>✉</span> Email</a></li>
                    <li><a (click)="sendVia(p, 'sms')"><span>💬</span> SMS</a></li>
                    <li><a (click)="sendVia(p, 'whatsapp')"><span>🟢</span> WhatsApp</a></li>
                    <div class="divider my-1"></div>
                    <li><a class="text-error" (click)="confirmDeletePayment(p)"><span>🗑</span> Delete payment</a></li>
                  </ul>
                </div>
              </td>
            </tr>
            <tr *ngIf="rows().length === 0">
              <td colspan="9" class="text-center opacity-60 py-8">No payments match your filters.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pagination -->
    <div class="flex items-center justify-between pt-3 text-sm flex-wrap gap-2 shrink-0" *ngIf="total() > 0">
      <div class="opacity-60">
        Showing {{ (page() - 1) * limit + 1 }}–{{ rangeEnd() }} of {{ total() }}
      </div>
      <div class="join">
        <button class="btn btn-sm join-item" (click)="goTo(page() - 1)" [disabled]="page() === 1">Previous</button>
        <button class="btn btn-sm join-item btn-active">{{ page() }} / {{ totalPages() }}</button>
        <button class="btn btn-sm join-item" (click)="goTo(page() + 1)" [disabled]="page() >= totalPages()">Next</button>
      </div>
    </div>

    <!-- ============================================ RECORD PAYMENT MODAL ================================ -->
    <dialog class="modal" [class.modal-open]="modalOpen()">
      <div class="modal-box max-w-2xl">
        <form method="dialog"><button type="button" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" (click)="closeModal()">✕</button></form>
        <h3 class="font-bold text-lg">Record payment</h3>
        <p class="text-sm opacity-60 mb-3">Offline cash receipts & student-side payments. Allocations auto-confirm at ≥ 50% paid.</p>

        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-3">
          <!-- Student -->
          <div class="form-control">
            <div class="label py-0.5"><span class="label-text text-sm">Student *</span></div>
            <lms-searchable-select
                [items]="studentItems()"
                placeholder="Pick a student"
                searchPlaceholder="Search name, code, or phone"
                formControlName="studentId">
            </lms-searchable-select>
          </div>

          <!-- Payment for — segmented, tags the payment for income-source reporting -->
          <div class="form-control">
            <div class="label py-0.5"><span class="label-text text-sm">Payment for *</span></div>
            <div class="join w-full">
              <button type="button" *ngFor="let s of sources" class="join-item btn btn-sm flex-1 normal-case"
                      [class.btn-primary]="form.value.source === s.value"
                      (click)="form.patchValue({ source: s.value })">{{ s.label }}</button>
            </div>
          </div>

          <!-- Amount / Discount / Method / Branch -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label class="form-control">
              <div class="label py-0.5"><span class="label-text text-sm">Amount (₹) *</span></div>
              <input class="input input-bordered input-sm" type="number" min="1" step="1" formControlName="amount" placeholder="0" />
            </label>
            <label class="form-control">
              <div class="label py-0.5">
                <span class="label-text text-sm">Discount (₹)</span>
              </div>
              <input class="input input-bordered input-sm" type="number" min="0" step="1" formControlName="discount" placeholder="0" />
            </label>
            <label class="form-control">
              <div class="label py-0.5"><span class="label-text text-sm">Method *</span></div>
              <select class="select select-bordered select-sm" formControlName="method">
                <option *ngFor="let m of methods" [value]="m">{{ labelFor(m) }}</option>
              </select>
            </label>
            <label class="form-control">
              <div class="label py-0.5"><span class="label-text text-sm">Branch *</span></div>
              <select class="select select-bordered select-sm" formControlName="branchId">
                <option *ngFor="let b of branches()" [value]="b.id">{{ b.name }}</option>
              </select>
            </label>
          </div>

          <!-- Discount reason (only when a discount is entered) -->
          <label class="form-control" *ngIf="discountAmount() > 0">
            <div class="label py-0.5">
              <span class="label-text text-sm">Discount reason</span>
              <span class="label-text-alt opacity-50 text-xs">why this concession was given</span>
            </div>
            <input class="input input-bordered input-sm" formControlName="discountReason" placeholder="e.g. sibling discount, scholarship, festive offer" />
          </label>

          <!-- Reference / Next due -->
          <div class="grid grid-cols-2 gap-3">
            <label class="form-control">
              <div class="label py-0.5"><span class="label-text text-sm">Reference / notes</span></div>
              <input class="input input-bordered input-sm" formControlName="notes" placeholder="UPI txn id, receipt # (optional)" />
            </label>
            <label class="form-control">
              <div class="label py-0.5">
                <span class="label-text text-sm">Next due on</span>
                <span class="label-text-alt opacity-50 text-xs">updates alerts</span>
              </div>
              <input class="input input-bordered input-sm" type="date" formControlName="nextDueDate" />
            </label>
          </div>

          <!-- Live balance for the selected student (compact) -->
          <div *ngIf="selectedSummary() as ss" class="text-xs rounded-lg bg-base-200 px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
            <span>Monthly fee: <strong>₹{{ ss.monthlyTotal | number }}</strong></span>
            <span>Paid so far: <strong>₹{{ ss.totalPaid | number }}</strong></span>
            <span *ngIf="discountAmount() > 0">Discount: <strong class="text-warning">−₹{{ discountAmount() | number }}</strong></span>
            <span>After this: <strong [class.text-error]="balanceAfter() > 0" [class.text-success]="balanceAfter() === 0">₹{{ balanceAfter() | number }}</strong></span>
          </div>

          <!-- Carried account balance (info only — every payment now updates it automatically) -->
          <div *ngIf="selectedBalance() !== 0" class="text-xs rounded-lg px-3 py-2"
               [ngClass]="selectedBalance() > 0 ? 'bg-error bg-opacity-10' : 'bg-success bg-opacity-10'">
            <span *ngIf="selectedBalance() > 0">Current balance due: <strong class="text-error">₹{{ selectedBalance() | number }}</strong> — this payment reduces it.</span>
            <span *ngIf="selectedBalance() < 0">Advance / credit on account: <strong class="text-success">₹{{ -selectedBalance() | number }}</strong></span>
          </div>

          <div class="modal-action mt-2">
            <button type="button" class="btn btn-ghost btn-sm" (click)="closeModal()">Cancel</button>
            <button class="btn btn-primary btn-sm" type="submit" [disabled]="form.invalid || saving()">
              <span *ngIf="saving()" class="loading loading-spinner loading-sm"></span>
              Record payment
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="closeModal()">close</button></form>
    </dialog>

    <!-- ============================================ PAYMENT DETAIL MODAL ================================ -->
    <dialog class="modal" [class.modal-open]="!!detailPayment()">
      <div class="modal-box max-w-2xl max-h-[90vh] overflow-y-auto" *ngIf="detailPayment() as p">
        <form method="dialog"><button type="button" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" (click)="closeDetail()">✕</button></form>
        <h3 class="font-bold text-lg">{{ p.student.fullName }}</h3>
        <p class="text-sm opacity-60">{{ p.student.code }} · {{ p.student.phone }}</p>

        <div *ngIf="detailLoading()" class="text-center py-8"><span class="loading loading-spinner loading-md"></span></div>

        <ng-container *ngIf="!detailLoading() && detail() as d">
          <!-- This payment's status -->
          <div class="alert mt-3 py-2"
               [class.alert-success]="payStatus(p, d) === 'Full'"
               [class.alert-warning]="payStatus(p, d) === 'Partial'">
            <span class="text-sm">
              This payment of <strong>₹{{ p.amount | number }}</strong>
              <ng-container *ngIf="d.monthlyTotal > 0">
                is a <strong>{{ payStatus(p, d) }}</strong> payment of the ₹{{ d.monthlyTotal | number }} monthly fee.
                <ng-container *ngIf="payStatus(p, d) === 'Partial'">
                  Balance for this cycle: <strong>₹{{ cycleBalance(p, d) | number }}</strong>.
                </ng-container>
              </ng-container>
              <ng-container *ngIf="d.monthlyTotal === 0">— no active allocation to compare against.</ng-container>
            </span>
          </div>

          <!-- Summary cards -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <div class="card bg-base-100 border border-base-300 p-3">
              <div class="text-[10px] uppercase tracking-wider opacity-60">Monthly fee</div>
              <div class="text-lg font-bold">₹{{ d.monthlyTotal | number }}</div>
            </div>
            <div class="card bg-base-100 border border-base-300 p-3">
              <div class="text-[10px] uppercase tracking-wider opacity-60">Total paid</div>
              <div class="text-lg font-bold text-success">₹{{ d.totalPaid | number }}</div>
            </div>
            <div class="card bg-base-100 border border-base-300 p-3">
              <div class="text-[10px] uppercase tracking-wider opacity-60">This payment</div>
              <div class="text-lg font-bold">₹{{ p.amount | number }}</div>
            </div>
            <div class="card bg-base-100 border border-base-300 p-3">
              <div class="text-[10px] uppercase tracking-wider opacity-60">Cycle balance</div>
              <div class="text-lg font-bold" [class.text-error]="cycleBalance(p, d) > 0">₹{{ cycleBalance(p, d) | number }}</div>
            </div>
          </div>

          <!-- Allocations -->
          <div *ngIf="d.allocations.length > 0" class="mt-4">
            <div class="text-xs uppercase tracking-wider opacity-60 mb-1">Active allocations</div>
            <div class="flex flex-wrap gap-2">
              <span *ngFor="let a of d.allocations" class="badge badge-outline gap-1 py-3">
                {{ a.label }} · ₹{{ a.monthlyRate | number }}/mo
                <span *ngIf="a.nextDueDate" class="opacity-60">· due {{ a.nextDueDate | date:'dd MMM yy' }}</span>
              </span>
            </div>
          </div>

          <!-- History -->
          <div class="divider text-xs my-3">Payment history ({{ d.payments.length }})</div>
          <div class="overflow-x-auto max-h-72">
            <table class="table table-sm table-pin-rows">
              <thead><tr><th>Date</th><th class="text-right">Amount</th><th>Method</th><th>Status</th><th>Notes</th></tr></thead>
              <tbody>
                <tr *ngFor="let h of d.payments" class="hover" [class.bg-base-200]="h.id === p.id">
                  <td class="text-xs">{{ (h.paidAt || h.createdAt) | date:'dd MMM yy, HH:mm' }}</td>
                  <td class="text-right font-medium">
                    ₹{{ h.amount | number }}
                    <div *ngIf="(h.discount ?? 0) > 0" class="text-xs font-normal text-warning" [title]="h.discountReason || 'Discount'">−₹{{ h.discount | number }} disc</div>
                  </td>
                  <td><span class="badge badge-ghost badge-sm">{{ labelFor(h.method) }}</span></td>
                  <td>
                    <span class="badge badge-sm"
                      [class.badge-success]="h.status === 'PAID'"
                      [class.badge-warning]="h.status === 'PENDING'"
                      [class.badge-error]="h.status === 'FAILED'"
                      [class.badge-ghost]="h.status === 'REFUNDED'">{{ h.status }}</span>
                  </td>
                  <td class="text-xs opacity-70 max-w-[160px] truncate" [title]="h.notes ?? ''">{{ h.notes || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </ng-container>

        <div class="modal-action">
          <button class="btn btn-ghost" (click)="closeDetail()">Close</button>
          <button class="btn btn-primary btn-outline" (click)="printReceipt(p)">🧾 Receipt</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="closeDetail()">close</button></form>
    </dialog>

    <!-- ============================================ DELETE PAYMENT MODAL ================================ -->
    <dialog class="modal" [class.modal-open]="!!deleting()">
      <div class="modal-box" *ngIf="deleting() as p">
        <h3 class="font-bold text-lg text-error">Delete payment?</h3>
        <p class="py-2 text-sm">
          Deleting ₹{{ p.amount | number }} from <strong>{{ p.student.fullName }}</strong> ({{ p.student.code }}).
          The record is kept for audit but removed from all lists and totals.
        </p>
        <label class="form-control">
          <div class="label py-1"><span class="label-text">Reason for deletion *</span></div>
          <textarea class="textarea textarea-bordered" rows="2" [(ngModel)]="deleteReason"
                    placeholder="e.g. duplicate entry, wrong amount, recorded for wrong student"></textarea>
        </label>
        <div class="modal-action">
          <button class="btn btn-ghost" (click)="closeDeletePayment()">Cancel</button>
          <button class="btn btn-error" (click)="doDeletePayment()" [disabled]="!deleteReason.trim() || deletingBusy()">
            <span *ngIf="deletingBusy()" class="loading loading-spinner loading-sm"></span>
            Delete payment
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="closeDeletePayment()">close</button></form>
    </dialog>
  `,
})
export class PaymentsComponent implements OnInit {
  private api = inject(PaymentsApiService);
  private studentsApi = inject(StudentsApiService);
  private branchesApi = inject(BranchesApiService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);

  rows = signal<PaymentRow[]>([]);
  students = signal<Student[]>([]);
  branches = signal<Branch[]>([]);

  modalOpen = signal(false);
  saving = signal(false);

  // Payment detail / history
  detailPayment = signal<PaymentRow | null>(null);
  detail = signal<PaymentSummary | null>(null);
  detailLoading = signal(false);

  // Soft delete
  deleting = signal<PaymentRow | null>(null);
  deleteReason = '';
  deletingBusy = signal(false);

  // Live balance for the student selected in the Record modal
  selectedSummary = signal<PaymentSummary | null>(null);
  // Outstanding (carried) balance for the selected student, from part payments.
  selectedBalance = signal<number>(0);

  dateFrom = '';
  dateTo = '';

  // Search / sort / pagination
  total = signal(0);
  page = signal(1);
  limit = 25;
  search = '';
  sortBy = signal<'date' | 'amount' | 'student'>('date');
  sortOrder = signal<'asc' | 'desc'>('desc');
  sortKey = computed(() => `${this.sortBy()}-${this.sortOrder()}`);
  private search$ = new Subject<void>();

  methods = METHODS;
  labelFor = (m: PaymentMethod) => METHOD_LABELS[m];

  sources = SOURCES;

  form = this.fb.group({
    studentId: ['', Validators.required],
    branchId: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(1)]],
    discount: [null as number | null, [Validators.min(0)]],
    discountReason: [''],
    source: ['CABIN' as PaymentSource, Validators.required],
    method: [PaymentMethod.CASH, Validators.required],
    notes: [''],
    nextDueDate: [''],
    applyToAccount: [false],
  });

  studentItems = computed<ComboItem[]>(() =>
    this.students().map((s) => ({
      id: s.id,
      label: s.fullName,
      sublabel: `${s.code} · ${s.phone}`,
    })),
  );

  ngOnInit() {
    this.search$.pipe(debounceTime(250)).subscribe(() => { this.page.set(1); this.reload(); });
    this.reload();
    this.branchesApi.list().subscribe((bs) => this.branches.set(bs));
    this.studentsApi.list({ limit: 200, sortBy: 'fullName', sortOrder: 'asc', status: 'ACTIVE' })
      .subscribe((r) => this.students.set(r.data as any));
    // Load the selected student's fee/paid summary so the modal can show a live balance.
    this.form.controls.studentId.valueChanges.subscribe((id) => {
      this.selectedSummary.set(null);
      const stu = this.students().find((s) => s.id === id);
      this.selectedBalance.set(stu ? Number((stu as any).outstandingBalance ?? 0) : 0);
      if (id) this.api.studentSummary(id).subscribe({ next: (s) => this.selectedSummary.set(s), error: () => undefined });
    });
  }

  /** Discount currently entered in the form (never negative). */
  discountAmount(): number {
    return Math.max(0, Number(this.form.value.discount) || 0);
  }

  /** Balance left on the monthly fee after the cash amount + discount currently entered. */
  balanceAfter(): number {
    const ss = this.selectedSummary();
    if (!ss) return 0;
    const amount = Number(this.form.value.amount) || 0;
    return Math.max(0, ss.monthlyTotal - amount - this.discountAmount());
  }

  reload() {
    this.api.list({
      dateFrom: this.dateFrom || undefined,
      dateTo: this.dateTo || undefined,
      search: this.search || undefined,
      sortBy: this.sortBy(),
      sortOrder: this.sortOrder(),
      page: this.page(),
      limit: this.limit,
    }).subscribe({
      next: (r) => { this.rows.set(r.data); this.total.set(r.total); },
      error: () => this.toast.error('Could not load payments'),
    });
  }

  onSearch() { this.search$.next(); }

  setSort(key: string) {
    const [field, order] = key.split('-') as ['date' | 'amount' | 'student', 'asc' | 'desc'];
    this.sortBy.set(field);
    this.sortOrder.set(order);
    this.page.set(1);
    this.reload();
  }

  onRangeChange(r: { from: string; to: string }) {
    this.dateFrom = r.from;
    this.dateTo = r.to;
    this.page.set(1);
    this.reload();
  }

  goTo(p: number) {
    if (p < 1 || p > this.totalPages() || p === this.page()) return;
    this.page.set(p);
    this.reload();
  }
  totalPages(): number { return Math.max(1, Math.ceil(this.total() / this.limit)); }
  rangeEnd(): number { return Math.min(this.page() * this.limit, this.total()); }

  doExport(kind: 'csv' | 'pdf') {
    this.api.list({
      dateFrom: this.dateFrom || undefined,
      dateTo: this.dateTo || undefined,
      search: this.search || undefined,
      sortBy: this.sortBy(),
      sortOrder: this.sortOrder(),
      limit: 5000,
    }).subscribe({
      next: (res) => this.buildExport(res.data, kind),
      error: () => this.toast.error('Could not load payments for export'),
    });
  }

  openDetail(p: PaymentRow) {
    (document.activeElement as HTMLElement | null)?.blur();
    this.detailPayment.set(p);
    this.detail.set(null);
    this.detailLoading.set(true);
    this.api.studentSummary(p.student.id).subscribe({
      next: (s) => { this.detail.set(s); this.detailLoading.set(false); },
      error: () => { this.toast.error('Could not load payment details'); this.detailLoading.set(false); },
    });
  }
  closeDetail() {
    this.detailPayment.set(null);
    this.detail.set(null);
  }

  confirmDeletePayment(p: PaymentRow) {
    (document.activeElement as HTMLElement | null)?.blur();
    this.deleteReason = '';
    this.deleting.set(p);
  }
  closeDeletePayment() {
    this.deleting.set(null);
    this.deletingBusy.set(false);
  }
  doDeletePayment() {
    const p = this.deleting();
    if (!p || !this.deleteReason.trim()) return;
    this.deletingBusy.set(true);
    this.api.deletePayment(p.id, this.deleteReason.trim()).subscribe({
      next: () => {
        this.toast.success(`Deleted ₹${p.amount} payment from ${p.student.fullName}`);
        this.closeDeletePayment();
        this.reload();
      },
      error: (err) => {
        this.toast.error(err.error?.message ?? 'Could not delete payment');
        this.deletingBusy.set(false);
      },
    });
  }

  /** Whether the given payment fully covers the monthly fee. */
  payStatus(p: PaymentRow, d: PaymentSummary): 'Full' | 'Partial' | '—' {
    if (!d.monthlyTotal) return '—';
    return Number(p.amount) >= d.monthlyTotal ? 'Full' : 'Partial';
  }
  /** Outstanding for the monthly cycle after this payment (never negative). */
  cycleBalance(p: PaymentRow, d: PaymentSummary): number {
    return Math.max(0, d.monthlyTotal - Number(p.amount));
  }

  receiptNo(p: PaymentRow): string {
    return receiptNumber({ id: p.id } as any);
  }

  printReceipt(p: PaymentRow) {
    const u = this.auth.user();
    const orgName = u?.tenantSlug
      ? u.tenantSlug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : 'LMS Platform';
    printPaymentReceipt(p as any, {
      name: orgName,
      tagline: 'Library & Study Cabin',
    });
  }

  sendVia(p: PaymentRow, channel: 'email' | 'sms' | 'whatsapp') {
    (document.activeElement as HTMLElement | null)?.blur();
    if (channel === 'email') {
      if (!p.student.email) { this.toast.error('This student has no email on file'); return; }
      this.toast.info(`Emailing receipt to ${p.student.email}…`);
      this.api.emailReceipt(p.id).subscribe({
        next: () => this.toast.success(`Receipt emailed to ${p.student.email}`),
        error: (err) => this.toast.error(err.error?.message ?? 'Could not send email'),
      });
      return;
    }
    const target = p.student.phone || 'no phone on file';
    this.toast.info(`${channel === 'sms' ? 'SMS' : 'WhatsApp'} delivery to ${target} — integration coming soon.`);
  }

  private buildExport(rows: PaymentRow[], kind: 'csv' | 'pdf') {
    if (rows.length === 0) {
      this.toast.error('No payments match the selected filters');
      return;
    }
    const cols: ExportColumn<PaymentRow>[] = [
      { header: 'Date', value: (p) => fmtDateTime(p.paidAt || p.createdAt) },
      { header: 'Student code', value: (p) => p.student.code },
      { header: 'Student name', value: (p) => p.student.fullName },
      { header: 'Amount (INR)', value: (p) => p.amount },
      { header: 'Method', value: (p) => METHOD_LABELS[p.method] || p.method },
      { header: 'Status', value: (p) => p.status },
      { header: 'Notes', value: (p) => p.notes ?? '' },
    ];
    const total = rows.filter((p) => p.status === 'PAID').reduce((s, p) => s + Number(p.amount || 0), 0);
    const f = this.dateFrom ? fmtDate(this.dateFrom) : 'beginning';
    const t = this.dateTo ? fmtDate(this.dateTo) : 'today';
    const subtitle = `Payment date: ${f} – ${t} · Collected: ₹${total.toLocaleString('en-IN')}`;
    const meta = { title: 'Payments report', subtitle, fileSlug: 'payments' };
    if (kind === 'csv') exportCsv(rows, cols, meta);
    else exportPdf(rows, cols, meta);
    this.toast.success(`Exported ${rows.length} payment${rows.length === 1 ? '' : 's'} as ${kind.toUpperCase()}`);
  }

  openRecordModal() {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    this.form.reset({
      studentId: '',
      branchId: this.branches()[0]?.id ?? '',
      amount: null,
      discount: null,
      discountReason: '',
      source: 'CABIN',
      method: PaymentMethod.CASH,
      notes: '',
      nextDueDate: nextMonth.toISOString().slice(0, 10),
      applyToAccount: false,
    });
    this.selectedBalance.set(0);
    this.modalOpen.set(true);
  }
  closeModal() {
    this.modalOpen.set(false);
    this.saving.set(false);
  }

  submit() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.getRawValue();
    // Prefix the notes with the source tag so income-by-source reporting can classify it.
    const tag = SOURCE_TAG[v.source as PaymentSource];
    const note = (v.notes || '').trim();
    const notes = tag ? (note ? `${tag} ${note}` : `${tag} payment`) : (note || undefined);
    const discount = Math.max(0, Number(v.discount) || 0);
    this.api.recordManual({
      studentId: v.studentId!,
      branchId: v.branchId!,
      amount: Number(v.amount),
      discount: discount > 0 ? discount : undefined,
      discountReason: discount > 0 ? (v.discountReason?.trim() || undefined) : undefined,
      method: v.method!,
      notes,
      nextDueDate: v.nextDueDate || undefined,
      applyToAccount: v.applyToAccount || undefined,
    }).subscribe({
      next: (p) => {
        this.toast.success(`Recorded ₹${p.amount} from ${p.student.fullName}`);
        this.closeModal();
        this.reload();
      },
      error: (err) => {
        const msg = err.error?.message ?? 'Payment failed';
        this.toast.error(Array.isArray(msg) ? msg.join(' · ') : msg);
        this.saving.set(false);
      },
    });
  }
}
