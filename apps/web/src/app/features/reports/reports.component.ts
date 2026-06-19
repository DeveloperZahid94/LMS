import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import {
  AgingBucket, AgingResponse, Bucket, ExpenseCategoryRow, ExpenseDetail, ExpenseDetailRow,
  IncomeBySource, IncomeSourceRow, MethodBreakdownRow, PlSeriesPoint, ProfitLoss,
  ReportsApiService, ReportsSummary, StudentStatusFilter, StudentSummaryRow, TimeseriesPoint,
} from './reports.service';
import { BranchesApiService, Branch } from '../students/branches.service';
import { VendorsApiService, Vendor } from '../../core/services/vendors.service';
import { ToastService } from '../../core/services/toast.service';
import { ExportColumn, exportCsv, exportPdf, fmtDate } from '../../shared/utils/export.util';

type TabKey = 'period' | 'student' | 'method' | 'aging' | 'expense' | 'expenseDetail' | 'pl' | 'source';
type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'last30' | 'last90' | 'ytd' | 'custom';
type SortField = 'name' | 'expected' | 'paid' | 'balance' | 'last' | 'status';

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash', UPI: 'UPI', CARD: 'Card', NETBANKING: 'Net banking',
  RAZORPAY: 'Razorpay', OTHER: 'Other',
};

const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  RENT: 'Rent', SALARY: 'Salary', ELECTRICITY: 'Electricity', WATER: 'Water',
  INTERNET: 'Internet', MAINTENANCE: 'Maintenance', SUPPLIES: 'Supplies',
  EQUIPMENT: 'Equipment', MARKETING: 'Marketing', MISC: 'Misc',
};

@Component({
  selector: 'lms-reports',
  standalone: true,
  host: { class: 'flex flex-col h-[calc(100dvh-5.75rem)] min-h-0 overflow-hidden' },
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <!-- HEADER -->
    <div class="flex items-end justify-between mb-4 flex-wrap gap-2 shrink-0">
      <div>
        <h1 class="text-2xl font-bold flex items-center gap-2">📊 Reports</h1>
        <p class="text-sm opacity-60 mt-1">Collections, outstanding fees & student-level payment status</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs opacity-50 hidden sm:inline" *ngIf="lastRefreshed()">Updated {{ lastRefreshed() | date:'shortTime' }}</span>
        <a routerLink="/reports/attendance" class="btn btn-sm btn-ghost gap-1">📋 Attendance</a>
        <div class="dropdown dropdown-end">
          <div tabindex="0" role="button" class="btn btn-sm btn-outline gap-1" [class.btn-disabled]="loading()">⬇ Export</div>
          <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box shadow z-30 mt-1 w-40 p-2 border border-base-300">
            <li><a (click)="doExport('csv')">📄 CSV ({{ tabLabel() }})</a></li>
            <li><a (click)="doExport('pdf')">🖨 PDF ({{ tabLabel() }})</a></li>
          </ul>
        </div>
        <button class="btn btn-sm btn-ghost btn-square" (click)="reload()" [disabled]="loading()" title="Refresh">
          <span *ngIf="loading()" class="loading loading-spinner loading-sm"></span>
          <span *ngIf="!loading()">⟳</span>
        </button>
      </div>
    </div>

    <!-- STATS -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3 shrink-0" *ngIf="summary() as s">
      <div class="card bg-base-100 border border-base-300 shadow-sm"><div class="card-body p-3">
        <div class="text-xs opacity-60 uppercase tracking-wider">Collected</div>
        <div class="text-2xl font-bold text-success">₹{{ s.kpis.totalCollected | number }}</div>
        <div class="text-xs opacity-50 mt-0.5" *ngIf="s.comparison.collectedDeltaPct !== null">
          {{ (s.comparison.collectedDeltaPct ?? 0) >= 0 ? '▲' : '▼' }} {{ absPct(s.comparison.collectedDeltaPct) | number:'1.0-1' }}% vs prior
        </div>
      </div></div>
      <div class="card bg-base-100 border border-base-300 shadow-sm"><div class="card-body p-3">
        <div class="text-xs opacity-60 uppercase tracking-wider">Expected</div>
        <div class="text-2xl font-bold text-primary">₹{{ s.kpis.totalExpected | number }}</div>
        <div class="text-xs opacity-50 mt-0.5">monthly baseline</div>
      </div></div>
      <div class="card bg-base-100 border border-base-300 shadow-sm cursor-pointer hover:border-error" (click)="jumpToStudents('UNPAID')" title="View unpaid students"><div class="card-body p-3">
        <div class="text-xs opacity-60 uppercase tracking-wider">Outstanding</div>
        <div class="text-2xl font-bold text-error">₹{{ s.kpis.outstanding | number }}</div>
        <div class="text-xs opacity-50 mt-0.5">{{ s.kpis.unpaidCount }} unpaid · {{ s.kpis.partialCount }} partial</div>
      </div></div>
      <div class="card bg-base-100 border border-base-300 shadow-sm"><div class="card-body p-3">
        <div class="text-xs opacity-60 uppercase tracking-wider">Coverage</div>
        <div class="text-2xl font-bold"
             [class.text-success]="s.kpis.coveragePct >= 90"
             [class.text-warning]="s.kpis.coveragePct >= 60 && s.kpis.coveragePct < 90"
             [class.text-error]="s.kpis.coveragePct < 60">{{ s.kpis.coveragePct | number:'1.0-1' }}%</div>
        <div class="text-xs opacity-50 mt-0.5">{{ s.kpis.paidCount }} of {{ s.kpis.studentCount }} fully paid</div>
      </div></div>
      <div class="card bg-base-100 border border-base-300 shadow-sm"><div class="card-body p-3">
        <div class="text-xs opacity-60 uppercase tracking-wider">Active students</div>
        <div class="text-2xl font-bold opacity-70">{{ s.kpis.studentCount }}</div>
      </div></div>
    </div>

    <!-- FILTER BAR -->
    <div class="card bg-base-100 border border-base-300 mb-3 shadow-sm shrink-0">
      <div class="card-body p-2 flex flex-row flex-wrap items-center gap-2">
        <div class="join">
          <button class="join-item btn btn-sm" *ngFor="let p of presetList"
                  [class.btn-active]="preset() === p.key" (click)="setPreset(p.key)">{{ p.label }}</button>
        </div>
        <label class="input input-bordered input-sm flex items-center gap-1 pr-1">
          <span class="opacity-50 text-xs">From</span>
          <input type="date" class="grow bg-transparent min-w-0" [(ngModel)]="dateFrom" (ngModelChange)="onDateChange()" [max]="dateTo || null" />
        </label>
        <label class="input input-bordered input-sm flex items-center gap-1 pr-1">
          <span class="opacity-50 text-xs">To</span>
          <input type="date" class="grow bg-transparent min-w-0" [(ngModel)]="dateTo" (ngModelChange)="onDateChange()" [min]="dateFrom || null" />
        </label>
        <select class="select select-bordered select-sm" [(ngModel)]="branchFilter" (ngModelChange)="reload()">
          <option [ngValue]="undefined">All branches</option>
          <option *ngFor="let b of branches()" [value]="b.id">{{ b.name }}</option>
        </select>
        <select *ngIf="tab() === 'expenseDetail'" class="select select-bordered select-sm" [ngModel]="vendorFilter()" (ngModelChange)="onVendorFilter($event)" title="Filter by vendor">
          <option value="">All vendors</option>
          <option *ngFor="let v of vendors()" [value]="v.name">{{ v.name }}</option>
        </select>
        <div class="ml-auto flex items-center gap-2" *ngIf="tab() === 'period' || tab() === 'pl'">
          <span class="text-xs uppercase tracking-wider opacity-50 hidden sm:inline">Group by</span>
          <div class="join">
            <button class="join-item btn btn-sm" *ngFor="let b of bucketList"
                    [class.btn-active]="bucket() === b" (click)="setBucket(b)">{{ b | titlecase }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- TABS -->
    <div role="tablist" class="tabs tabs-boxed bg-base-200 p-1 rounded-xl mb-3 inline-flex flex-wrap shrink-0 self-start">
      <a role="tab" class="tab gap-1" [class.tab-active]="tab() === 'period'"  (click)="tab.set('period')">📅 By Period</a>
      <a role="tab" class="tab gap-1" [class.tab-active]="tab() === 'student'" (click)="tab.set('student')">
        👤 By Student <span *ngIf="studentStatus() !== 'ALL'" class="badge badge-xs badge-primary">{{ studentStatus() }}</span>
      </a>
      <a role="tab" class="tab gap-1" [class.tab-active]="tab() === 'method'"  (click)="tab.set('method')">💳 By Method</a>
      <a role="tab" class="tab gap-1" [class.tab-active]="tab() === 'aging'"   (click)="tab.set('aging')">⏳ Aging</a>
      <a role="tab" class="tab gap-1" [class.tab-active]="tab() === 'pl'"      (click)="tab.set('pl')">📈 Income vs Expense</a>
      <a role="tab" class="tab gap-1" [class.tab-active]="tab() === 'expense'" (click)="tab.set('expense')">💸 Expenses</a>
      <a role="tab" class="tab gap-1" [class.tab-active]="tab() === 'expenseDetail'" (click)="tab.set('expenseDetail')">📋 Expense detail</a>
      <a role="tab" class="tab gap-1" [class.tab-active]="tab() === 'source'"  (click)="tab.set('source')">🧩 Income by source</a>
    </div>

    <!-- STUDENT SUB-FILTER -->
    <div class="flex items-center gap-2 mb-2 flex-wrap shrink-0" *ngIf="tab() === 'student'">
      <div class="join">
        <button class="join-item btn btn-sm" *ngFor="let s of studentStatusList"
                [class.btn-active]="studentStatus() === s.key" (click)="setStudentStatus(s.key)">
          {{ s.label }}<span *ngIf="s.key !== 'ALL'" class="badge badge-xs ml-1">{{ countForStatus(s.key) }}</span>
        </button>
      </div>
      <label class="input input-bordered input-sm flex items-center gap-2 ml-auto min-w-[220px]">
        <span class="opacity-50">🔍</span>
        <input type="text" class="grow" [(ngModel)]="studentSearch" placeholder="Search name, code, or phone…" />
      </label>
    </div>

    <!-- TABLE AREA -->
    <div class="card bg-base-100 border border-base-300 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
      <div class="overflow-auto flex-1 min-h-0" [ngSwitch]="tab()">

        <!-- BY PERIOD -->
        <table *ngSwitchCase="'period'" class="table">
          <thead class="bg-base-200 sticky top-0 z-10">
            <tr class="text-xs uppercase tracking-wider">
              <th>{{ bucket() | titlecase }}</th>
              <th class="text-right">Txns</th>
              <th class="text-right">Paid</th>
              <th class="text-right">Pending</th>
              <th class="text-right">Refunded</th>
              <th class="text-right">Failed</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let p of series()" class="hover">
              <td class="font-medium">{{ p.label }}</td>
              <td class="text-right">{{ p.paymentCount }}</td>
              <td class="text-right text-success font-medium">₹{{ p.paidAmount | number }}</td>
              <td class="text-right opacity-70">₹{{ p.pendingAmount | number }}</td>
              <td class="text-right opacity-70">₹{{ p.refundedAmount | number }}</td>
              <td class="text-right opacity-70">₹{{ p.failedAmount | number }}</td>
              <td class="text-right font-medium">₹{{ p.totalAmount | number }}</td>
            </tr>
            <tr *ngIf="series().length === 0 && !loading()"><td colspan="7" class="text-center opacity-60 py-10">No data for this range.</td></tr>
            <tr *ngIf="loading()"><td colspan="7" class="text-center py-6"><span class="loading loading-spinner loading-md"></span></td></tr>
          </tbody>
          <tfoot *ngIf="series().length > 0" class="sticky bottom-0">
            <tr class="bg-base-200 font-semibold">
              <td>Totals</td>
              <td class="text-right">{{ seriesTotals().count }}</td>
              <td class="text-right text-success">₹{{ seriesTotals().paid | number }}</td>
              <td class="text-right">₹{{ seriesTotals().pending | number }}</td>
              <td class="text-right">₹{{ seriesTotals().refunded | number }}</td>
              <td class="text-right">₹{{ seriesTotals().failed | number }}</td>
              <td class="text-right">₹{{ seriesTotals().total | number }}</td>
            </tr>
          </tfoot>
        </table>

        <!-- BY STUDENT -->
        <table *ngSwitchCase="'student'" class="table">
          <thead class="bg-base-200 sticky top-0 z-10">
            <tr class="text-xs uppercase tracking-wider">
              <th>Code</th>
              <th class="cursor-pointer select-none" (click)="sortBy('name')">Student {{ sortArrow('name') }}</th>
              <th>Branch</th>
              <th class="text-right cursor-pointer select-none" (click)="sortBy('expected')">Expected {{ sortArrow('expected') }}</th>
              <th class="text-right cursor-pointer select-none" (click)="sortBy('paid')">Paid {{ sortArrow('paid') }}</th>
              <th class="text-right cursor-pointer select-none" (click)="sortBy('balance')">Balance {{ sortArrow('balance') }}</th>
              <th class="cursor-pointer select-none" (click)="sortBy('status')">Status {{ sortArrow('status') }}</th>
              <th class="cursor-pointer select-none" (click)="sortBy('last')">Last paid {{ sortArrow('last') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of filteredStudents()" class="hover">
              <td><code class="text-xs bg-base-200 px-1.5 py-0.5 rounded">{{ r.code }}</code></td>
              <td>
                <div class="font-medium">{{ r.fullName }}</div>
                <div class="opacity-60 text-xs">{{ r.phone }}</div>
              </td>
              <td class="text-sm">{{ r.branchName || '—' }}</td>
              <td class="text-right">₹{{ r.expectedAmount | number }}</td>
              <td class="text-right text-success font-medium">₹{{ r.paidAmount | number }}</td>
              <td class="text-right font-medium" [class.text-error]="r.balance > 0" [class.text-success]="r.balance <= 0 && r.expectedAmount > 0">₹{{ r.balance | number }}</td>
              <td>
                <span class="badge badge-sm"
                  [class.badge-success]="r.status === 'PAID'"
                  [class.badge-warning]="r.status === 'PARTIAL'"
                  [class.badge-error]="r.status === 'UNPAID'">{{ r.status }}</span>
              </td>
              <td class="text-sm opacity-80">{{ r.lastPaymentAt ? (r.lastPaymentAt | date:'mediumDate') : '—' }}</td>
            </tr>
            <tr *ngIf="filteredStudents().length === 0 && !loading()"><td colspan="8" class="text-center opacity-60 py-10">No students match this filter.</td></tr>
            <tr *ngIf="loading()"><td colspan="8" class="text-center py-6"><span class="loading loading-spinner loading-md"></span></td></tr>
          </tbody>
          <tfoot *ngIf="filteredStudents().length > 0" class="sticky bottom-0">
            <tr class="bg-base-200 font-semibold">
              <td colspan="3">{{ filteredStudents().length }} student{{ filteredStudents().length === 1 ? '' : 's' }}</td>
              <td class="text-right">₹{{ filteredTotals().expected | number }}</td>
              <td class="text-right text-success">₹{{ filteredTotals().paid | number }}</td>
              <td class="text-right text-error">₹{{ filteredTotals().balance | number }}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>

        <!-- BY METHOD -->
        <table *ngSwitchCase="'method'" class="table">
          <thead class="bg-base-200 sticky top-0 z-10">
            <tr class="text-xs uppercase tracking-wider">
              <th>Method</th>
              <th class="text-right">Transactions</th>
              <th class="text-right">Amount</th>
              <th class="text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let m of methods()" class="hover">
              <td class="font-medium">{{ labelForMethod(m.method) }}</td>
              <td class="text-right">{{ m.paymentCount }}</td>
              <td class="text-right font-medium text-success">₹{{ m.totalAmount | number }}</td>
              <td class="text-right">{{ m.pctOfTotal | number:'1.1-1' }}%</td>
            </tr>
            <tr *ngIf="methods().length === 0 && !loading()"><td colspan="4" class="text-center opacity-60 py-10">No payments collected in this range.</td></tr>
            <tr *ngIf="loading()"><td colspan="4" class="text-center py-6"><span class="loading loading-spinner loading-md"></span></td></tr>
          </tbody>
        </table>

        <!-- INCOME vs EXPENSE (P&L) -->
        <table *ngSwitchCase="'pl'" class="table">
          <thead class="bg-base-200 sticky top-0 z-10">
            <tr class="text-xs uppercase tracking-wider">
              <th>{{ bucket() | titlecase }}</th>
              <th class="text-right">Income</th>
              <th class="text-right">Expense</th>
              <th class="text-right">Net</th>
            </tr>
          </thead>
          <tbody *ngIf="pl() as p">
            <tr *ngFor="let r of p.series" class="hover">
              <td class="font-medium">{{ r.label }}</td>
              <td class="text-right text-success">₹{{ r.income | number }}</td>
              <td class="text-right text-error">₹{{ r.expense | number }}</td>
              <td class="text-right font-semibold" [class.text-success]="r.net >= 0" [class.text-error]="r.net < 0">
                {{ r.net < 0 ? '−₹' + (-r.net | number) : '₹' + (r.net | number) }}
              </td>
            </tr>
            <tr *ngIf="p.series.length === 0 && !loading()"><td colspan="4" class="text-center opacity-60 py-10">No income or expenses in this range.</td></tr>
          </tbody>
          <tbody *ngIf="!pl()"><tr><td colspan="4" class="text-center py-6"><span class="loading loading-spinner loading-md"></span></td></tr></tbody>
          <tfoot *ngIf="pl() as p" class="sticky bottom-0">
            <tr class="bg-base-200 font-semibold">
              <td>Net margin {{ p.totals.marginPct | number:'1.0-1' }}%</td>
              <td class="text-right text-success">₹{{ p.totals.income | number }}</td>
              <td class="text-right text-error">₹{{ p.totals.expense | number }}</td>
              <td class="text-right" [class.text-success]="p.totals.net >= 0" [class.text-error]="p.totals.net < 0">
                {{ p.totals.net < 0 ? '−₹' + (-p.totals.net | number) : '₹' + (p.totals.net | number) }}
              </td>
            </tr>
          </tfoot>
        </table>

        <!-- EXPENSES BY CATEGORY -->
        <table *ngSwitchCase="'expense'" class="table">
          <thead class="bg-base-200 sticky top-0 z-10">
            <tr class="text-xs uppercase tracking-wider">
              <th>Category</th>
              <th class="text-right">Entries</th>
              <th class="text-right">Amount</th>
              <th class="text-right">Share</th>
            </tr>
          </thead>
          <tbody *ngIf="pl() as p">
            <tr *ngFor="let c of p.byCategory" class="hover">
              <td class="font-medium">{{ labelForCategory(c.category) }}</td>
              <td class="text-right">{{ c.count }}</td>
              <td class="text-right font-medium text-error">₹{{ c.amount | number }}</td>
              <td class="text-right">{{ c.pctOfTotal | number:'1.1-1' }}%</td>
            </tr>
            <tr *ngIf="p.byCategory.length === 0 && !loading()"><td colspan="4" class="text-center opacity-60 py-10">No expenses recorded in this range.</td></tr>
          </tbody>
          <tbody *ngIf="!pl()"><tr><td colspan="4" class="text-center py-6"><span class="loading loading-spinner loading-md"></span></td></tr></tbody>
          <tfoot *ngIf="pl() as p" class="sticky bottom-0">
            <tr class="bg-base-200 font-semibold">
              <td>Total expenses</td>
              <td></td>
              <td class="text-right text-error">₹{{ p.totals.expense | number }}</td>
              <td class="text-right">100%</td>
            </tr>
          </tfoot>
        </table>

        <!-- EXPENSE DETAIL (line items: incurred vs paid) -->
        <table *ngSwitchCase="'expenseDetail'" class="table table-sm">
          <thead class="bg-base-200 sticky top-0 z-10">
            <tr class="text-xs uppercase tracking-wider">
              <th>Date</th>
              <th>Expense</th>
              <th>Category</th>
              <th>Branch</th>
              <th>Tagged to</th>
              <th class="text-right">Expense</th>
              <th class="text-right">Paid</th>
              <th class="text-right">Adv</th>
              <th class="text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody *ngIf="expenseDetail() as d">
            <ng-container *ngFor="let e of d.items">
              <tr class="hover" [class.cursor-pointer]="e.payments.length" (click)="e.payments.length && toggleRow(e.id)">
                <td class="whitespace-nowrap text-sm">
                  <span class="inline-block w-3 opacity-60">{{ e.payments.length ? (isExpanded(e.id) ? '▾' : '▸') : '' }}</span>
                  {{ e.expenseDate | date:'dd MMM yyyy' }}
                </td>
                <td>
                  <div class="font-medium">{{ e.title }}</div>
                  <div class="opacity-60 text-xs" *ngIf="e.vendor">{{ e.vendor }}</div>
                </td>
                <td><span class="badge badge-ghost badge-sm">{{ labelForCategory(e.category) }}</span></td>
                <td class="text-sm">{{ e.branchName || '—' }}</td>
                <td class="text-sm">{{ e.staffName || '—' }}</td>
                <td class="text-right font-medium">₹{{ e.amount | number }}</td>
                <td class="text-right text-success">
                  ₹{{ e.paidAmount | number }}
                  <span *ngIf="e.payments.length" class="block text-xs opacity-60">{{ e.payments.length }} payment{{ e.payments.length === 1 ? '' : 's' }}</span>
                </td>
                <td class="text-right" [class.text-info]="e.advanceApplied > 0" [class.opacity-40]="e.advanceApplied <= 0">
                  {{ e.advanceApplied > 0 ? '₹' + (e.advanceApplied | number) : '—' }}
                </td>
                <td class="text-right" [class.text-warning]="e.outstanding > 0" [class.opacity-50]="e.outstanding <= 0">
                  ₹{{ e.outstanding | number }}
                  <span *ngIf="e.outstanding > 0 && e.dueDate" class="block text-xs opacity-60">due {{ e.dueDate | date:'dd/MM/yy' }}</span>
                </td>
              </tr>
              <!-- PAYMENT BREAKDOWN (one row per partial/full payment) -->
              <ng-container *ngIf="isExpanded(e.id)">
                <tr *ngFor="let p of e.payments; let i = index" class="bg-base-200/40 text-sm">
                  <td class="text-xs opacity-70 whitespace-nowrap pl-6">{{ p.paidDate | date:'dd MMM yyyy' }}</td>
                  <td colspan="3" class="text-xs">
                    <span class="opacity-60">↳ Payment {{ i + 1 }} of {{ e.payments.length }}</span>
                    <span *ngIf="p.notes" class="opacity-80"> — {{ p.notes }}</span>
                  </td>
                  <td><span class="badge badge-ghost badge-xs" *ngIf="p.paymentMethod">{{ p.paymentMethod }}</span></td>
                  <td class="text-right opacity-30">—</td>
                  <td class="text-right text-success">₹{{ p.amount | number }}</td>
                  <td></td>
                  <td></td>
                </tr>
              </ng-container>
            </ng-container>
            <tr *ngIf="d.items.length === 0 && !loading()"><td colspan="9" class="text-center opacity-60 py-10">No expenses recorded in this range.</td></tr>
          </tbody>
          <tbody *ngIf="!expenseDetail()"><tr><td colspan="9" class="text-center py-6"><span class="loading loading-spinner loading-md"></span></td></tr></tbody>
          <tfoot *ngIf="expenseDetail() as d" class="sticky bottom-0">
            <tr class="bg-base-200 font-semibold">
              <td colspan="5">{{ d.totals.count }} expense{{ d.totals.count === 1 ? '' : 's' }}</td>
              <td class="text-right">₹{{ d.totals.amount | number }}</td>
              <td class="text-right text-success">₹{{ d.totals.paid | number }}</td>
              <td class="text-right text-info">₹{{ d.totals.advance | number }}</td>
              <td class="text-right text-warning">₹{{ d.totals.outstanding | number }}</td>
            </tr>
          </tfoot>
        </table>

        <!-- INCOME BY SOURCE -->
        <table *ngSwitchCase="'source'" class="table">
          <thead class="bg-base-200 sticky top-0 z-10">
            <tr class="text-xs uppercase tracking-wider">
              <th>Source</th>
              <th class="text-right">Payments</th>
              <th class="text-right">Amount</th>
              <th class="text-right">Share</th>
            </tr>
          </thead>
          <tbody *ngIf="incomeSources() as src">
            <tr *ngFor="let r of src.bySource" class="hover">
              <td class="font-medium">{{ r.label }}</td>
              <td class="text-right">{{ r.count }}</td>
              <td class="text-right font-medium text-success">₹{{ r.amount | number }}</td>
              <td class="text-right">{{ r.pctOfTotal | number:'1.1-1' }}%</td>
            </tr>
            <tr *ngIf="src.bySource.length === 0 && !loading()"><td colspan="4" class="text-center opacity-60 py-10">No income recorded in this range.</td></tr>
          </tbody>
          <tbody *ngIf="!incomeSources()"><tr><td colspan="4" class="text-center py-6"><span class="loading loading-spinner loading-md"></span></td></tr></tbody>
          <tfoot *ngIf="incomeSources() as src" class="sticky bottom-0">
            <tr class="bg-base-200 font-semibold">
              <td>Total income</td>
              <td></td>
              <td class="text-right text-success">₹{{ src.total | number }}</td>
              <td class="text-right">100%</td>
            </tr>
          </tfoot>
        </table>

        <!-- AGING -->
        <table *ngSwitchCase="'aging'" class="table">
          <thead class="bg-base-200 sticky top-0 z-10">
            <tr class="text-xs uppercase tracking-wider">
              <th>Bucket</th>
              <th class="text-right">Students</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody *ngIf="aging() as a">
            <tr *ngFor="let b of a.buckets" class="hover">
              <td [class]="agingTextClass(b.bucket)">{{ b.label }}</td>
              <td class="text-right">{{ b.studentCount }}</td>
              <td class="text-right font-medium">₹{{ b.totalAmount | number }}</td>
            </tr>
          </tbody>
          <tbody *ngIf="!aging()">
            <tr><td colspan="3" class="text-center py-6"><span class="loading loading-spinner loading-md"></span></td></tr>
          </tbody>
          <tfoot *ngIf="aging() as a" class="sticky bottom-0">
            <tr class="bg-base-200 font-semibold">
              <td class="text-error">At risk</td>
              <td></td>
              <td class="text-right text-error">₹{{ a.totalAtRisk | number }}</td>
            </tr>
          </tfoot>
        </table>

      </div>
    </div>
  `,
})
export class ReportsComponent implements OnInit {
  private api = inject(ReportsApiService);
  private branchesApi = inject(BranchesApiService);
  private vendorsApi = inject(VendorsApiService);
  private toast = inject(ToastService);

  presetList: { key: Preset; label: string }[] = [
    { key: 'today',     label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'week',      label: 'This week' },
    { key: 'month',     label: 'This month' },
    { key: 'last30',    label: 'Last 30d' },
    { key: 'last90',    label: 'Last 90d' },
    { key: 'ytd',       label: 'YTD' },
    { key: 'custom',    label: 'Custom' },
  ];
  bucketList: Bucket[] = ['day', 'week', 'month'];
  studentStatusList: { key: StudentStatusFilter; label: string }[] = [
    { key: 'ALL',     label: 'All' },
    { key: 'PAID',    label: 'Paid' },
    { key: 'PARTIAL', label: 'Partial' },
    { key: 'UNPAID',  label: 'Unpaid' },
  ];

  dateFrom = '';
  dateTo = '';
  branchFilter: string | undefined;

  preset = signal<Preset>('month');
  bucket = signal<Bucket>('day');
  tab = signal<TabKey>('period');
  studentStatus = signal<StudentStatusFilter>('ALL');
  studentSearch = '';
  sortField = signal<SortField>('balance');
  sortOrder = signal<'asc' | 'desc'>('desc');

  loading = signal(false);
  lastRefreshed = signal<Date | null>(null);
  branches = signal<Branch[]>([]);
  summary = signal<ReportsSummary | null>(null);
  series = signal<TimeseriesPoint[]>([]);
  students = signal<StudentSummaryRow[]>([]);
  methods = signal<MethodBreakdownRow[]>([]);
  aging = signal<AgingResponse | null>(null);
  pl = signal<ProfitLoss | null>(null);
  incomeSources = signal<IncomeBySource | null>(null);
  expenseDetail = signal<ExpenseDetail | null>(null);
  expandedRows = signal<Set<string>>(new Set());
  vendors = signal<Vendor[]>([]);
  vendorFilter = signal<string>('');   // '' = all vendors

  filteredStudents = computed(() => {
    const q = this.studentSearch.trim().toLowerCase();
    const status = this.studentStatus();
    let rows = this.students();
    if (status !== 'ALL') rows = rows.filter((r) => r.status === status);
    if (q) {
      rows = rows.filter(
        (s) =>
          s.fullName.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          (s.phone || '').toLowerCase().includes(q),
      );
    }
    return this.sortRows(rows);
  });

  filteredTotals = computed(() => {
    const acc = { expected: 0, paid: 0, balance: 0 };
    for (const s of this.filteredStudents()) {
      acc.expected += s.expectedAmount;
      acc.paid += s.paidAmount;
      acc.balance += s.balance;
    }
    return acc;
  });

  seriesTotals = computed(() => {
    const acc = { count: 0, paid: 0, pending: 0, refunded: 0, failed: 0, total: 0 };
    for (const p of this.series()) {
      acc.count    += p.paymentCount;
      acc.paid     += p.paidAmount;
      acc.pending  += p.pendingAmount;
      acc.refunded += p.refundedAmount;
      acc.failed   += p.failedAmount;
      acc.total    += p.totalAmount;
    }
    return acc;
  });

  tabLabel = computed(() =>
    this.tab() === 'period'  ? 'by-period' :
    this.tab() === 'student' ? 'by-student' :
    this.tab() === 'method'  ? 'by-method' :
    this.tab() === 'pl'      ? 'income-vs-expense' :
    this.tab() === 'expense' ? 'expenses' :
    this.tab() === 'expenseDetail' ? 'expense-detail' :
    this.tab() === 'source'  ? 'income-by-source' : 'aging',
  );

  ngOnInit() {
    this.branchesApi.list().subscribe((bs) => this.branches.set(bs));
    this.vendorsApi.list().subscribe({ next: (vs) => this.vendors.set(vs), error: () => {} });
    this.applyPreset('month');
  }

  onVendorFilter(name: string) {
    this.vendorFilter.set(name);
    this.reloadExpenseDetail();
  }

  /** Re-fetch just the expense detail (vendor filter changes don't need a full reload). */
  private reloadExpenseDetail() {
    if (!this.dateFrom || !this.dateTo) return;
    this.api.expenseDetail({
      dateFrom: this.dateFrom, dateTo: this.dateTo, branchId: this.branchFilter,
      vendor: this.vendorFilter() || undefined,
    }).subscribe({ next: (r) => this.expenseDetail.set(r), error: () => {} });
  }

  setPreset(p: Preset) {
    this.preset.set(p);
    if (p !== 'custom') this.applyPreset(p);
  }

  setBucket(b: Bucket) {
    this.bucket.set(b);
    this.reloadTimeseries();
  }

  setStudentStatus(s: StudentStatusFilter) {
    this.studentStatus.set(s);
  }

  onDateChange() {
    if (!this.dateFrom || !this.dateTo) return;
    this.preset.set('custom');
    this.reload();
  }

  countForStatus(s: 'PAID' | 'PARTIAL' | 'UNPAID'): number {
    const k = this.summary();
    if (!k) return 0;
    return s === 'PAID' ? k.kpis.paidCount : s === 'PARTIAL' ? k.kpis.partialCount : k.kpis.unpaidCount;
  }

  jumpToStudents(status: StudentStatusFilter) {
    this.tab.set('student');
    this.studentStatus.set(status);
  }

  sortBy(field: SortField) {
    if (this.sortField() === field) {
      this.sortOrder.set(this.sortOrder() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortOrder.set(field === 'name' || field === 'status' ? 'asc' : 'desc');
    }
  }

  sortArrow(field: SortField): string {
    if (this.sortField() !== field) return '↕';
    return this.sortOrder() === 'asc' ? '↑' : '↓';
  }

  private sortRows(rows: StudentSummaryRow[]): StudentSummaryRow[] {
    const field = this.sortField();
    const dir = this.sortOrder() === 'asc' ? 1 : -1;
    const cmp = (a: StudentSummaryRow, b: StudentSummaryRow) => {
      switch (field) {
        case 'name': return a.fullName.localeCompare(b.fullName) * dir;
        case 'expected': return (a.expectedAmount - b.expectedAmount) * dir;
        case 'paid':     return (a.paidAmount - b.paidAmount) * dir;
        case 'balance':  return (a.balance - b.balance) * dir;
        case 'status':   return a.status.localeCompare(b.status) * dir;
        case 'last':
          return ((new Date(a.lastPaymentAt || 0).getTime()) - (new Date(b.lastPaymentAt || 0).getTime())) * dir;
      }
    };
    return [...rows].sort(cmp);
  }

  private applyPreset(p: Preset) {
    const today = new Date();
    let from = new Date(today);
    let to = new Date(today);
    if (p === 'yesterday') {
      from = new Date(today); from.setDate(today.getDate() - 1);
      to = new Date(from);
    } else if (p === 'week') {
      const dow = (today.getDay() + 6) % 7; // Monday=0
      from = new Date(today); from.setDate(today.getDate() - dow);
    } else if (p === 'month') {
      from = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (p === 'last30') {
      from = new Date(today); from.setDate(today.getDate() - 29);
    } else if (p === 'last90') {
      from = new Date(today); from.setDate(today.getDate() - 89);
    } else if (p === 'ytd') {
      from = new Date(today.getFullYear(), 0, 1);
    }
    this.dateFrom = iso(from);
    this.dateTo   = iso(to);
    this.bucket.set(
      p === 'today' || p === 'yesterday' || p === 'week' ? 'day' :
      p === 'last90' || p === 'ytd' ? 'month' : 'day',
    );
    this.reload();
  }

  reload() {
    if (!this.dateFrom || !this.dateTo) return;
    this.loading.set(true);
    const range = { dateFrom: this.dateFrom, dateTo: this.dateTo, branchId: this.branchFilter };
    forkJoin({
      summary:  this.api.summary(range),
      series:   this.api.timeseries({ ...range, bucket: this.bucket() }),
      students: this.api.students({ ...range, status: 'ALL' }),
      methods:  this.api.methods(range),
      aging:    this.api.aging(this.branchFilter),
      pl:       this.api.profitLoss({ ...range, bucket: this.bucket() }),
      sources:  this.api.incomeBySource(range),
      expenseDetail: this.api.expenseDetail({ ...range, vendor: this.vendorFilter() || undefined }),
    }).subscribe({
      next: (r) => {
        this.summary.set(r.summary);
        this.series.set(r.series);
        this.students.set(r.students);
        this.methods.set(r.methods);
        this.aging.set(r.aging);
        this.pl.set(r.pl);
        this.incomeSources.set(r.sources);
        this.expenseDetail.set(r.expenseDetail);
        this.lastRefreshed.set(new Date());
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Could not load reports');
        this.loading.set(false);
      },
    });
  }

  reloadTimeseries() {
    const range = { dateFrom: this.dateFrom, dateTo: this.dateTo, branchId: this.branchFilter, bucket: this.bucket() };
    this.api.timeseries(range).subscribe((r) => this.series.set(r));
    this.api.profitLoss(range).subscribe((r) => this.pl.set(r));
  }

  agingTextClass(bucket: string): string {
    switch (bucket) {
      case 'CURRENT':   return 'text-success font-medium';
      case 'D_1_30':    return 'text-warning font-medium';
      case 'D_31_60':   return 'text-orange-500 font-medium';
      case 'D_61_90':   return 'text-error font-medium';
      case 'D_90_PLUS': return 'text-red-700 font-bold';
      default: return '';
    }
  }

  absPct(v: number | null): number {
    return Math.abs(v ?? 0);
  }

  labelForMethod(m: string): string {
    return PAYMENT_METHOD_LABEL[m] ?? m;
  }

  labelForCategory(c: string): string {
    return EXPENSE_CATEGORY_LABEL[c] ?? c;
  }

  /** Expand/collapse an expense's payment breakdown in the detail report. */
  toggleRow(id: string) {
    const next = new Set(this.expandedRows());
    next.has(id) ? next.delete(id) : next.add(id);
    this.expandedRows.set(next);
  }
  isExpanded(id: string): boolean {
    return this.expandedRows().has(id);
  }

  doExport(kind: 'csv' | 'pdf') {
    const subtitle = `${fmtDate(this.dateFrom)} – ${fmtDate(this.dateTo)}` +
      (this.branchFilter ? ` · Branch ${this.branchName(this.branchFilter)}` : ' · All branches');
    const t = this.tab();
    if (t === 'period') {
      const cols: ExportColumn<TimeseriesPoint>[] = [
        { header: this.bucket().toUpperCase(), value: (p) => p.label },
        { header: 'Transactions',  value: (p) => p.paymentCount },
        { header: 'Paid (INR)',    value: (p) => p.paidAmount },
        { header: 'Pending (INR)', value: (p) => p.pendingAmount },
        { header: 'Refunded (INR)',value: (p) => p.refundedAmount },
        { header: 'Failed (INR)',  value: (p) => p.failedAmount },
        { header: 'Total (INR)',   value: (p) => p.totalAmount },
      ];
      this.dispatch(kind, this.series(), cols, 'Collections by ' + this.bucket(), subtitle, 'collections-by-' + this.bucket());
    } else if (t === 'student') {
      const cols: ExportColumn<StudentSummaryRow>[] = [
        { header: 'Code',          value: (r) => r.code },
        { header: 'Name',          value: (r) => r.fullName },
        { header: 'Phone',         value: (r) => r.phone },
        { header: 'Email',         value: (r) => r.email ?? '' },
        { header: 'Branch',        value: (r) => r.branchName ?? '' },
        { header: 'Expected (INR)',value: (r) => r.expectedAmount },
        { header: 'Paid (INR)',    value: (r) => r.paidAmount },
        { header: 'Pending (INR)', value: (r) => r.pendingAmount },
        { header: 'Balance (INR)', value: (r) => r.balance },
        { header: 'Status',        value: (r) => r.status },
        { header: 'Payments',      value: (r) => r.paymentCount },
        { header: 'Last paid',     value: (r) => r.lastPaymentAt ? fmtDate(r.lastPaymentAt) : '' },
      ];
      const filt = this.filteredStudents();
      const statusSuffix = this.studentStatus() === 'ALL' ? '' : ' · ' + this.studentStatus();
      this.dispatch(kind, filt, cols, 'Student payment summary' + statusSuffix, subtitle, 'student-payments');
    } else if (t === 'method') {
      const cols: ExportColumn<MethodBreakdownRow>[] = [
        { header: 'Method',       value: (m) => this.labelForMethod(m.method) },
        { header: 'Transactions', value: (m) => m.paymentCount },
        { header: 'Amount (INR)', value: (m) => m.totalAmount },
        { header: 'Share %',      value: (m) => m.pctOfTotal },
      ];
      this.dispatch(kind, this.methods(), cols, 'Collections by method', subtitle, 'collections-by-method');
    } else if (t === 'pl') {
      const cols: ExportColumn<PlSeriesPoint>[] = [
        { header: this.bucket().toUpperCase(), value: (r) => r.label },
        { header: 'Income (INR)',  value: (r) => r.income },
        { header: 'Expense (INR)', value: (r) => r.expense },
        { header: 'Net (INR)',     value: (r) => r.net },
      ];
      const tot = this.pl()?.totals;
      const sub = subtitle + (tot ? ` · Net ₹${tot.net} (${tot.marginPct}% margin)` : '');
      this.dispatch(kind, this.pl()?.series ?? [], cols, 'Income vs Expense', sub, 'income-vs-expense');
    } else if (t === 'expense') {
      const cols: ExportColumn<ExpenseCategoryRow>[] = [
        { header: 'Category',     value: (c) => this.labelForCategory(c.category) },
        { header: 'Entries',      value: (c) => c.count },
        { header: 'Amount (INR)', value: (c) => c.amount },
        { header: 'Share %',      value: (c) => c.pctOfTotal },
      ];
      this.dispatch(kind, this.pl()?.byCategory ?? [], cols, 'Expenses by category', subtitle, 'expenses-by-category');
    } else if (t === 'expenseDetail') {
      const cols: ExportColumn<ExpenseDetailRow>[] = [
        { header: 'Date',            value: (e) => fmtDate(e.expenseDate) },
        { header: 'Expense',         value: (e) => e.title },
        { header: 'Category',        value: (e) => this.labelForCategory(e.category) },
        { header: 'Branch',          value: (e) => e.branchName ?? '' },
        { header: 'Tagged to',       value: (e) => e.staffName ?? '' },
        { header: 'Vendor',          value: (e) => e.vendor ?? '' },
        { header: 'Expense (INR)',   value: (e) => e.amount },
        { header: 'Paid (INR)',      value: (e) => e.paidAmount },
        { header: 'Advance (INR)',   value: (e) => e.advanceApplied },
        { header: 'Outstanding (INR)',value: (e) => e.outstanding },
        { header: 'Status',          value: (e) => e.paymentStatus },
        { header: 'Due date',        value: (e) => e.dueDate ? fmtDate(e.dueDate) : '' },
      ];
      this.dispatch(kind, this.expenseDetail()?.items ?? [], cols, 'Expense detail', subtitle, 'expense-detail');
    } else if (t === 'source') {
      const cols: ExportColumn<IncomeSourceRow>[] = [
        { header: 'Source',       value: (r) => r.label },
        { header: 'Payments',     value: (r) => r.count },
        { header: 'Amount (INR)', value: (r) => r.amount },
        { header: 'Share %',      value: (r) => r.pctOfTotal },
      ];
      this.dispatch(kind, this.incomeSources()?.bySource ?? [], cols, 'Income by source', subtitle, 'income-by-source');
    } else {
      const a = this.aging();
      const cols: ExportColumn<AgingBucket>[] = [
        { header: 'Bucket',       value: (b) => b.label },
        { header: 'Students',     value: (b) => b.studentCount },
        { header: 'Amount (INR)', value: (b) => b.totalAmount },
      ];
      this.dispatch(kind, a?.buckets ?? [], cols, 'Outstanding aging', subtitle, 'outstanding-aging');
    }
  }

  private dispatch<T>(kind: 'csv' | 'pdf', rows: T[], cols: ExportColumn<T>[], title: string, subtitle: string, fileSlug: string) {
    if (rows.length === 0) {
      this.toast.error('No rows to export for this view.');
      return;
    }
    const meta = { title, subtitle, fileSlug };
    if (kind === 'csv') exportCsv(rows, cols, meta);
    else exportPdf(rows, cols, meta);
    this.toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'} as ${kind.toUpperCase()}`);
  }

  private branchName(id: string): string {
    return this.branches().find((b) => b.id === id)?.name ?? '';
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
