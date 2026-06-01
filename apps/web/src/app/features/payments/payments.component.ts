import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { PaymentsApiService, PaymentRow } from './payments.service';
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

@Component({
  selector: 'lms-payments',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent, ExportToolbarComponent],
  template: `
    <div class="flex items-end justify-between mb-4 flex-wrap gap-2">
      <div>
        <h1 class="text-2xl font-bold">Payments</h1>
        <p class="text-sm opacity-60">
          Record cash, UPI, and gateway payments. Allocations auto-confirm at ≥ 50% paid.
          <span *ngIf="rows().length > 0"> · {{ rows().length }} record{{ rows().length === 1 ? '' : 's' }} · Total ₹{{ totalCollected() | number }}</span>
        </p>
      </div>
      <button class="btn btn-primary btn-sm" (click)="openRecordModal()">+ Record payment</button>
    </div>

    <div class="card bg-base-100 border border-base-300 mb-3">
      <div class="card-body py-3 flex flex-row flex-wrap items-center gap-2">
        <span class="text-xs opacity-60">Filter by payment date:</span>
        <lms-export-toolbar
          [dateFrom]="dateFrom"
          [dateTo]="dateTo"
          (rangeChange)="onRangeChange($event)"
          (exportRequested)="doExport($event)">
        </lms-export-toolbar>
      </div>
    </div>

    <div class="card bg-base-100 border border-base-300 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>Date</th>
              <th>Receipt #</th>
              <th>Student</th>
              <th class="text-right">Amount</th>
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
              <td class="text-right font-medium">₹{{ p.amount | number }}</td>
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
                <div class="join">
                  <button class="btn btn-xs join-item btn-primary btn-outline" (click)="printReceipt(p)" title="Open printable receipt">
                    🧾 Receipt
                  </button>
                  <div class="dropdown dropdown-end join-item">
                    <div tabindex="0" role="button" class="btn btn-xs btn-outline">
                      Send
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-30 mt-1 w-44 p-2 border border-base-300">
                      <li><a (click)="sendVia(p, 'email')"><span>✉</span> Email</a></li>
                      <li><a (click)="sendVia(p, 'sms')"><span>💬</span> SMS</a></li>
                      <li><a (click)="sendVia(p, 'whatsapp')"><span>🟢</span> WhatsApp</a></li>
                    </ul>
                  </div>
                </div>
              </td>
            </tr>
            <tr *ngIf="rows().length === 0">
              <td colspan="8" class="text-center opacity-60 py-8">No payments yet — click "Record payment" to log one.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ============================================ RECORD PAYMENT MODAL ================================ -->
    <dialog class="modal" [class.modal-open]="modalOpen()">
      <div class="modal-box max-w-lg">
        <form method="dialog"><button type="button" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" (click)="closeModal()">✕</button></form>
        <h3 class="font-bold text-lg">Record payment</h3>
        <p class="text-sm opacity-60">Student-side payments and offline cash receipts.</p>

        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-3 mt-3">
          <div class="form-control">
            <div class="label py-1"><span class="label-text">Student *</span></div>
            <lms-searchable-select
                [items]="studentItems()"
                placeholder="Pick a student"
                searchPlaceholder="Search name, code, or phone"
                formControlName="studentId">
            </lms-searchable-select>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Amount (₹) *</span></div>
              <input class="input input-bordered" type="number" min="1" step="1" formControlName="amount" placeholder="0" />
            </label>
            <label class="form-control">
              <div class="label py-1"><span class="label-text">Branch *</span></div>
              <select class="select select-bordered" formControlName="branchId">
                <option *ngFor="let b of branches()" [value]="b.id">{{ b.name }} ({{ b.code }})</option>
              </select>
            </label>
          </div>

          <div class="form-control">
            <div class="label py-1"><span class="label-text">Method *</span></div>
            <div class="grid grid-cols-3 gap-2">
              <label *ngFor="let m of methods"
                     class="border rounded-lg p-2 cursor-pointer transition-all hover:border-primary text-center text-sm"
                     [class.border-primary]="form.value.method === m"
                     [class.bg-primary]="form.value.method === m"
                     [class.bg-opacity-10]="form.value.method === m"
                     [class.border-base-300]="form.value.method !== m">
                <input type="radio" class="hidden" formControlName="method" [value]="m" />
                <div class="font-medium">{{ labelFor(m) }}</div>
              </label>
            </div>
          </div>

          <label class="form-control">
            <div class="label py-1">
              <span class="label-text">Reference / notes</span>
              <span class="label-text-alt opacity-60">e.g. UPI txn id, receipt #</span>
            </div>
            <input class="input input-bordered" formControlName="notes" placeholder="(optional)" />
          </label>

          <label class="form-control">
            <div class="label py-1">
              <span class="label-text">Next installment due on</span>
              <span class="label-text-alt opacity-60">(optional)</span>
            </div>
            <input class="input input-bordered" type="date" formControlName="nextDueDate" />
            <div class="label py-1">
              <span class="label-text-alt opacity-60">
                If set, updates the student's active seat allocations so alerts fire on that date.
              </span>
            </div>
          </label>

          <div class="modal-action">
            <button type="button" class="btn btn-ghost" (click)="closeModal()">Cancel</button>
            <button class="btn btn-primary" type="submit" [disabled]="form.invalid || saving()">
              <span *ngIf="saving()" class="loading loading-spinner loading-sm"></span>
              Record payment
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop"><button type="button" (click)="closeModal()">close</button></form>
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

  dateFrom = '';
  dateTo = '';

  methods = METHODS;
  labelFor = (m: PaymentMethod) => METHOD_LABELS[m];

  totalCollected = computed(() =>
    this.rows().filter((p) => p.status === 'PAID').reduce((s, p) => s + Number(p.amount || 0), 0),
  );

  form = this.fb.group({
    studentId: ['', Validators.required],
    branchId: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(1)]],
    method: [PaymentMethod.CASH, Validators.required],
    notes: [''],
    nextDueDate: [''],
  });

  studentItems = computed<ComboItem[]>(() =>
    this.students().map((s) => ({
      id: s.id,
      label: s.fullName,
      sublabel: `${s.code} · ${s.phone}`,
    })),
  );

  ngOnInit() {
    this.reload();
    this.branchesApi.list().subscribe((bs) => this.branches.set(bs));
    this.studentsApi.list({ limit: 200, sortBy: 'fullName', sortOrder: 'asc', status: 'ACTIVE' })
      .subscribe((r) => this.students.set(r.data as any));
  }

  reload() {
    this.api.list({
      dateFrom: this.dateFrom || undefined,
      dateTo: this.dateTo || undefined,
    }).subscribe({
      next: (r) => this.rows.set(r),
      error: () => this.toast.error('Could not load payments'),
    });
  }

  onRangeChange(r: { from: string; to: string }) {
    this.dateFrom = r.from;
    this.dateTo = r.to;
    this.reload();
  }

  doExport(kind: 'csv' | 'pdf') {
    this.api.list({
      dateFrom: this.dateFrom || undefined,
      dateTo: this.dateTo || undefined,
      limit: 5000,
    }).subscribe({
      next: (rows) => this.buildExport(rows, kind),
      error: () => this.toast.error('Could not load payments for export'),
    });
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
    const labels: Record<typeof channel, string> = {
      email: 'Email',
      sms: 'SMS',
      whatsapp: 'WhatsApp',
    } as const;
    const target =
      channel === 'email' ? (p.student.email || 'no email on file') :
      p.student.phone || 'no phone on file';
    this.toast.info(`${labels[channel]} delivery to ${target} — integration coming soon.`);
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
      method: PaymentMethod.CASH,
      notes: '',
      nextDueDate: nextMonth.toISOString().slice(0, 10),
    });
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
    this.api.recordManual({
      studentId: v.studentId!,
      branchId: v.branchId!,
      amount: Number(v.amount),
      method: v.method!,
      notes: v.notes || undefined,
      nextDueDate: v.nextDueDate || undefined,
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
