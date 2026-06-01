import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  AgingBucket, AgingResponse, Bucket, MethodBreakdownRow, ReportsApiService,
  ReportsSummary, StudentStatusFilter, StudentSummaryRow, TimeseriesPoint,
} from './reports.service';
import { BranchesApiService, Branch } from '../students/branches.service';
import { ToastService } from '../../core/services/toast.service';
import { ExportColumn, exportCsv, exportPdf, fmtDate } from '../../shared/utils/export.util';

type TabKey = 'overview' | 'period' | 'student' | 'method';
type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'last30' | 'last90' | 'ytd' | 'custom';
type SortField = 'name' | 'expected' | 'paid' | 'balance' | 'last' | 'status';

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash', UPI: 'UPI', CARD: 'Card', NETBANKING: 'Net banking',
  RAZORPAY: 'Razorpay', OTHER: 'Other',
};

@Component({
  selector: 'lms-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- ================================ HEADER ================================ -->
    <div class="flex items-end justify-between mb-3 flex-wrap gap-2">
      <div>
        <h1 class="text-2xl font-bold">Reports</h1>
        <p class="text-sm opacity-60">
          Collections, outstanding fees, and student-level payment status.
        </p>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <span class="opacity-60 text-xs" *ngIf="lastRefreshed()">
          Updated {{ lastRefreshed() | date:'mediumTime' }}
        </span>
        <button class="btn btn-sm btn-ghost" (click)="reload()" [disabled]="loading()" title="Refresh">
          <span *ngIf="loading()" class="loading loading-spinner loading-xs"></span>
          <span *ngIf="!loading()">↻</span>
          Refresh
        </button>
      </div>
    </div>

    <!-- ================================ FILTERS ================================ -->
    <div class="card bg-base-100 border border-base-300 mb-4">
      <div class="card-body p-4 space-y-3">
        <!-- Preset chips -->
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs uppercase tracking-wider opacity-60 font-semibold w-20">Quick range</span>
          <div class="join">
            <button class="join-item btn btn-sm" *ngFor="let p of presetList"
                    [class.btn-primary]="preset() === p.key"
                    (click)="setPreset(p.key)">{{ p.label }}</button>
          </div>
        </div>

        <!-- Always-visible date pickers + branch + bucket -->
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs uppercase tracking-wider opacity-60 font-semibold w-20">Dates</span>
          <div class="join">
            <span class="join-item btn btn-sm btn-ghost no-animation pointer-events-none opacity-70">From</span>
            <input type="date" class="join-item input input-bordered input-sm"
                   [(ngModel)]="dateFrom" (ngModelChange)="onDateChange()" [max]="dateTo || null" />
            <span class="join-item btn btn-sm btn-ghost no-animation pointer-events-none opacity-70">To</span>
            <input type="date" class="join-item input input-bordered input-sm"
                   [(ngModel)]="dateTo" (ngModelChange)="onDateChange()" [min]="dateFrom || null" />
          </div>
          <select class="select select-bordered select-sm" [(ngModel)]="branchFilter" (ngModelChange)="reload()">
            <option [ngValue]="undefined">All branches</option>
            <option *ngFor="let b of branches()" [value]="b.id">{{ b.name }}</option>
          </select>
          <span class="ml-auto text-xs opacity-60">Bucket:</span>
          <div class="join">
            <button class="join-item btn btn-sm" *ngFor="let b of bucketList"
                    [class.btn-primary]="bucket() === b"
                    (click)="setBucket(b)">{{ b | titlecase }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ================================ KPI TILES with deltas ================================ -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4" *ngIf="summary() as s">
      <!-- COLLECTED -->
      <div class="card bg-base-100 border border-base-300 hover:shadow-md transition-shadow">
        <div class="card-body p-4">
          <div class="flex items-start justify-between">
            <div class="text-xs uppercase tracking-wider opacity-60">Collected</div>
            <span class="badge badge-sm" *ngIf="s.comparison.collectedDeltaPct !== null"
                  [class.badge-success]="(s.comparison.collectedDeltaPct ?? 0) >= 0"
                  [class.badge-error]="(s.comparison.collectedDeltaPct ?? 0) < 0">
              <span>{{ (s.comparison.collectedDeltaPct ?? 0) >= 0 ? '▲' : '▼' }}</span>
              {{ absPct(s.comparison.collectedDeltaPct) | number:'1.1-1' }}%
            </span>
            <span class="badge badge-sm badge-ghost" *ngIf="s.comparison.collectedDeltaPct === null">new</span>
          </div>
          <div class="text-2xl font-bold text-success mt-1">₹{{ s.kpis.totalCollected | number }}</div>
          <div class="text-xs opacity-60 mt-1">
            vs ₹{{ s.comparison.previousCollected | number }} prior period
          </div>
        </div>
      </div>

      <!-- EXPECTED -->
      <div class="card bg-base-100 border border-base-300 hover:shadow-md transition-shadow">
        <div class="card-body p-4">
          <div class="flex items-start justify-between">
            <div class="text-xs uppercase tracking-wider opacity-60">Expected</div>
            <div class="tooltip tooltip-left" data-tip="Monthly billing baseline — SUM(monthlyRate) across active seat allocations">
              <span class="opacity-40 text-xs cursor-help">ⓘ</span>
            </div>
          </div>
          <div class="text-2xl font-bold mt-1">₹{{ s.kpis.totalExpected | number }}</div>
          <div class="text-xs opacity-60 mt-1">{{ s.kpis.studentCount }} active student{{ s.kpis.studentCount === 1 ? '' : 's' }}</div>
        </div>
      </div>

      <!-- OUTSTANDING -->
      <div class="card bg-base-100 border border-base-300 hover:shadow-md transition-shadow cursor-pointer"
           (click)="jumpToStudents('UNPAID')">
        <div class="card-body p-4">
          <div class="flex items-start justify-between">
            <div class="text-xs uppercase tracking-wider opacity-60">Outstanding</div>
            <span class="text-xs opacity-50">drill ↗</span>
          </div>
          <div class="text-2xl font-bold text-error mt-1">₹{{ s.kpis.outstanding | number }}</div>
          <div class="text-xs opacity-60 mt-1">
            {{ s.kpis.unpaidCount }} unpaid · {{ s.kpis.partialCount }} partial
          </div>
        </div>
      </div>

      <!-- COVERAGE -->
      <div class="card bg-base-100 border border-base-300 hover:shadow-md transition-shadow">
        <div class="card-body p-4">
          <div class="text-xs uppercase tracking-wider opacity-60">Coverage</div>
          <div class="text-2xl font-bold mt-1"
               [class.text-success]="s.kpis.coveragePct >= 90"
               [class.text-warning]="s.kpis.coveragePct >= 60 && s.kpis.coveragePct < 90"
               [class.text-error]="s.kpis.coveragePct < 60">
            {{ s.kpis.coveragePct | number:'1.1-1' }}%
          </div>
          <progress class="progress w-full mt-1"
                    [class.progress-success]="s.kpis.coveragePct >= 90"
                    [class.progress-warning]="s.kpis.coveragePct >= 60 && s.kpis.coveragePct < 90"
                    [class.progress-error]="s.kpis.coveragePct < 60"
                    [value]="s.kpis.coveragePct" max="100"></progress>
        </div>
      </div>
    </div>

    <!-- Clickable status chips → jump to student tab filtered -->
    <div class="flex items-center gap-2 mb-4 flex-wrap" *ngIf="summary() as s">
      <span class="text-xs opacity-60 uppercase tracking-wider font-semibold">Status:</span>
      <button class="badge badge-success badge-lg gap-2 cursor-pointer hover:scale-105 transition-transform"
              (click)="jumpToStudents('PAID')">
        ✓ PAID <span class="badge badge-sm bg-success-content text-success">{{ s.kpis.paidCount }}</span>
      </button>
      <button class="badge badge-warning badge-lg gap-2 cursor-pointer hover:scale-105 transition-transform"
              (click)="jumpToStudents('PARTIAL')">
        ◐ PARTIAL <span class="badge badge-sm bg-warning-content text-warning">{{ s.kpis.partialCount }}</span>
      </button>
      <button class="badge badge-error badge-lg gap-2 cursor-pointer hover:scale-105 transition-transform"
              (click)="jumpToStudents('UNPAID')">
        ✕ UNPAID <span class="badge badge-sm bg-error-content text-error">{{ s.kpis.unpaidCount }}</span>
      </button>

      <div class="ml-auto flex items-center gap-2">
        <span class="text-xs opacity-60">Export {{ tabLabel() }}:</span>
        <button class="btn btn-sm btn-outline" (click)="doExport('csv')" [disabled]="loading()">📄 CSV</button>
        <button class="btn btn-sm btn-outline" (click)="doExport('pdf')" [disabled]="loading()">🖨 PDF</button>
      </div>
    </div>

    <!-- ================================ TABS ================================ -->
    <div role="tablist" class="tabs tabs-bordered mb-3">
      <a role="tab" class="tab gap-2" [class.tab-active]="tab() === 'overview'" (click)="tab.set('overview')">
        <span>📊</span> Overview
      </a>
      <a role="tab" class="tab gap-2" [class.tab-active]="tab() === 'period'"   (click)="tab.set('period')">
        <span>📅</span> By Period
      </a>
      <a role="tab" class="tab gap-2" [class.tab-active]="tab() === 'student'"  (click)="tab.set('student')">
        <span>👤</span> By Student
        <span *ngIf="studentStatus() !== 'ALL'" class="badge badge-xs badge-primary">{{ studentStatus() }}</span>
      </a>
      <a role="tab" class="tab gap-2" [class.tab-active]="tab() === 'method'"   (click)="tab.set('method')">
        <span>💳</span> By Method
      </a>
    </div>

    <!-- ================================ OVERVIEW ================================ -->
    <ng-container *ngIf="tab() === 'overview'">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <!-- Collections chart (spans 2 cols) -->
        <div class="card bg-base-100 border border-base-300 lg:col-span-2">
          <div class="card-body p-4">
            <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <div class="font-semibold">Collections by {{ bucket() }}</div>
                <div class="text-xs opacity-60">PAID amounts in the selected range</div>
              </div>
              <span class="text-xs opacity-60" *ngIf="series().length > 0">
                Peak: ₹{{ seriesPeak() | number }}
              </span>
            </div>

            <div *ngIf="series().length === 0" class="text-center opacity-60 py-12">
              No payments in the selected window.
            </div>

            <div *ngIf="series().length > 0" class="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              <div *ngFor="let p of series()" class="flex items-center gap-2 text-xs">
                <div class="w-20 opacity-70 shrink-0 truncate" [title]="p.label">{{ p.label }}</div>
                <div class="flex-1 relative">
                  <div class="h-6 rounded bg-base-200 overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-primary to-secondary flex items-center px-2 text-primary-content font-medium"
                         [style.width.%]="barWidth(p.paidAmount)">
                      <span *ngIf="barWidth(p.paidAmount) > 25" class="truncate">₹{{ p.paidAmount | number }}</span>
                    </div>
                  </div>
                </div>
                <div class="w-28 text-right shrink-0 text-xs">
                  <span *ngIf="barWidth(p.paidAmount) <= 25" class="font-medium">₹{{ p.paidAmount | number }}</span>
                  <span class="opacity-60"> · {{ p.paymentCount }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Aging buckets -->
        <div class="card bg-base-100 border border-base-300">
          <div class="card-body p-4">
            <div class="flex items-center justify-between mb-2">
              <div>
                <div class="font-semibold">Outstanding aging</div>
                <div class="text-xs opacity-60">A/R aging on active allocations</div>
              </div>
              <span class="text-xs opacity-60" *ngIf="aging() as a">
                At risk: <span class="font-semibold text-error">₹{{ a.totalAtRisk | number }}</span>
              </span>
            </div>

            <div *ngIf="aging() as a" class="space-y-2 mt-2">
              <div *ngFor="let b of a.buckets" class="flex items-center gap-2">
                <div class="w-20 text-xs shrink-0" [class]="agingTextClass(b.bucket)">
                  {{ b.label }}
                </div>
                <div class="flex-1">
                  <div class="h-6 rounded bg-base-200 overflow-hidden">
                    <div class="h-full flex items-center px-2 text-xs"
                         [class]="agingBarClass(b.bucket)"
                         [style.width.%]="agingBarWidth(b)">
                      <span *ngIf="agingBarWidth(b) > 30" class="font-medium text-white">
                        ₹{{ b.totalAmount | number }}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="w-20 text-xs text-right shrink-0 opacity-70">
                  {{ b.studentCount }} stu
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Top performers + Method breakdown -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3" *ngIf="summary() as s">
        <!-- Top payers -->
        <div class="card bg-base-100 border border-base-300">
          <div class="card-body p-4">
            <div class="font-semibold mb-2 flex items-center gap-2">🏆 Top payers</div>
            <div *ngIf="s.topPayers.length === 0" class="text-xs opacity-60 py-4 text-center">No payments yet.</div>
            <div class="space-y-2">
              <div *ngFor="let p of s.topPayers; let i = index" class="flex items-center gap-2 text-sm">
                <div class="w-5 h-5 rounded-full grid place-items-center text-xs font-bold shrink-0"
                     [class.bg-yellow-200]="i === 0" [class.text-yellow-900]="i === 0"
                     [class.bg-base-200]="i !== 0" [class.text-base-content]="i !== 0">
                  {{ i + 1 }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium truncate">{{ p.fullName }}</div>
                  <div class="text-xs opacity-60">{{ p.code }}</div>
                </div>
                <div class="text-success font-semibold text-sm">₹{{ p.paidAmount | number }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Top outstanding -->
        <div class="card bg-base-100 border border-base-300">
          <div class="card-body p-4">
            <div class="font-semibold mb-2 flex items-center gap-2">⚠ Top outstanding</div>
            <div *ngIf="s.topOutstanding.length === 0" class="text-xs opacity-60 py-4 text-center">No outstanding balances.</div>
            <div class="space-y-2">
              <div *ngFor="let p of s.topOutstanding; let i = index" class="flex items-center gap-2 text-sm">
                <div class="w-5 h-5 rounded-full grid place-items-center text-xs font-bold shrink-0 bg-error bg-opacity-20 text-error">
                  {{ i + 1 }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium truncate">{{ p.fullName }}</div>
                  <div class="text-xs opacity-60">{{ p.code }} · {{ p.phone }}</div>
                </div>
                <div class="text-error font-semibold text-sm">₹{{ p.balance | number }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Method breakdown -->
        <div class="card bg-base-100 border border-base-300">
          <div class="card-body p-4">
            <div class="font-semibold mb-2 flex items-center gap-2">💳 By method</div>
            <div *ngIf="methods().length === 0" class="text-xs opacity-60 py-4 text-center">No collections in this range.</div>
            <div class="space-y-2">
              <div *ngFor="let m of methods()" class="text-xs">
                <div class="flex items-center justify-between mb-0.5">
                  <span class="font-medium">{{ labelForMethod(m.method) }}</span>
                  <span class="opacity-70">₹{{ m.totalAmount | number }} · {{ m.pctOfTotal | number:'1.1-1' }}%</span>
                </div>
                <div class="h-2 rounded bg-base-200 overflow-hidden">
                  <div class="h-full bg-info" [style.width.%]="m.pctOfTotal"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ng-container>

    <!-- ================================ BY PERIOD ================================ -->
    <ng-container *ngIf="tab() === 'period'">
      <div class="card bg-base-100 border border-base-300 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table table-zebra table-pin-rows">
            <thead>
              <tr>
                <th>{{ bucket() | titlecase }}</th>
                <th class="text-right">Transactions</th>
                <th class="text-right">Paid</th>
                <th class="text-right">Pending</th>
                <th class="text-right">Refunded</th>
                <th class="text-right">Failed</th>
                <th class="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let p of series()">
                <td class="font-medium">{{ p.label }}</td>
                <td class="text-right">{{ p.paymentCount }}</td>
                <td class="text-right text-success font-medium">₹{{ p.paidAmount | number }}</td>
                <td class="text-right opacity-70">₹{{ p.pendingAmount | number }}</td>
                <td class="text-right opacity-70">₹{{ p.refundedAmount | number }}</td>
                <td class="text-right opacity-70">₹{{ p.failedAmount | number }}</td>
                <td class="text-right font-medium">₹{{ p.totalAmount | number }}</td>
              </tr>
              <tr *ngIf="series().length === 0">
                <td colspan="7" class="text-center opacity-60 py-8">No data for this range.</td>
              </tr>
            </tbody>
            <tfoot *ngIf="series().length > 0">
              <tr class="font-semibold">
                <th>Totals</th>
                <th class="text-right">{{ seriesTotals().count }}</th>
                <th class="text-right text-success">₹{{ seriesTotals().paid | number }}</th>
                <th class="text-right">₹{{ seriesTotals().pending | number }}</th>
                <th class="text-right">₹{{ seriesTotals().refunded | number }}</th>
                <th class="text-right">₹{{ seriesTotals().failed | number }}</th>
                <th class="text-right">₹{{ seriesTotals().total | number }}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ng-container>

    <!-- ================================ BY STUDENT ================================ -->
    <ng-container *ngIf="tab() === 'student'">
      <div class="flex items-center gap-2 mb-2 flex-wrap">
        <span class="text-xs opacity-60 uppercase tracking-wider font-semibold">Filter:</span>
        <div class="join">
          <button class="join-item btn btn-sm" *ngFor="let s of studentStatusList"
                  [class.btn-primary]="studentStatus() === s.key"
                  (click)="setStudentStatus(s.key)">
            {{ s.label }}
            <span *ngIf="s.key !== 'ALL'" class="badge badge-xs">{{ countForStatus(s.key) }}</span>
          </button>
        </div>
        <input class="input input-bordered input-sm w-64 ml-auto"
               [(ngModel)]="studentSearch" placeholder="Search name, code, or phone…" />
      </div>

      <div class="card bg-base-100 border border-base-300 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table table-zebra table-pin-rows">
            <thead>
              <tr>
                <th>Code</th>
                <th class="cursor-pointer select-none" (click)="sortBy('name')">
                  Student <span class="opacity-60">{{ sortArrow('name') }}</span>
                </th>
                <th>Branch</th>
                <th class="text-right cursor-pointer select-none" (click)="sortBy('expected')">
                  Expected <span class="opacity-60">{{ sortArrow('expected') }}</span>
                </th>
                <th class="text-right cursor-pointer select-none" (click)="sortBy('paid')">
                  Paid <span class="opacity-60">{{ sortArrow('paid') }}</span>
                </th>
                <th class="text-right cursor-pointer select-none" (click)="sortBy('balance')">
                  Balance <span class="opacity-60">{{ sortArrow('balance') }}</span>
                </th>
                <th class="cursor-pointer select-none" (click)="sortBy('status')">
                  Status <span class="opacity-60">{{ sortArrow('status') }}</span>
                </th>
                <th class="cursor-pointer select-none" (click)="sortBy('last')">
                  Last paid <span class="opacity-60">{{ sortArrow('last') }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of filteredStudents()">
                <td><code class="text-xs bg-base-200 px-1.5 py-0.5 rounded">{{ r.code }}</code></td>
                <td>
                  <div class="font-medium">{{ r.fullName }}</div>
                  <div class="opacity-60 text-xs">{{ r.phone }}</div>
                </td>
                <td class="text-sm">{{ r.branchName || '—' }}</td>
                <td class="text-right">₹{{ r.expectedAmount | number }}</td>
                <td class="text-right text-success font-medium">₹{{ r.paidAmount | number }}</td>
                <td class="text-right font-medium"
                    [class.text-error]="r.balance > 0"
                    [class.text-success]="r.balance <= 0 && r.expectedAmount > 0">
                  ₹{{ r.balance | number }}
                </td>
                <td>
                  <span class="badge badge-sm"
                    [class.badge-success]="r.status === 'PAID'"
                    [class.badge-warning]="r.status === 'PARTIAL'"
                    [class.badge-error]="r.status === 'UNPAID'">
                    {{ r.status }}
                  </span>
                </td>
                <td class="text-sm opacity-80">{{ r.lastPaymentAt ? (r.lastPaymentAt | date:'mediumDate') : '—' }}</td>
              </tr>
              <tr *ngIf="filteredStudents().length === 0">
                <td colspan="8" class="text-center opacity-60 py-8">No students match this filter.</td>
              </tr>
            </tbody>
            <tfoot *ngIf="filteredStudents().length > 0">
              <tr class="font-semibold">
                <th colspan="3">{{ filteredStudents().length }} student{{ filteredStudents().length === 1 ? '' : 's' }}</th>
                <th class="text-right">₹{{ filteredTotals().expected | number }}</th>
                <th class="text-right text-success">₹{{ filteredTotals().paid | number }}</th>
                <th class="text-right text-error">₹{{ filteredTotals().balance | number }}</th>
                <th colspan="2"></th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ng-container>

    <!-- ================================ BY METHOD ================================ -->
    <ng-container *ngIf="tab() === 'method'">
      <div class="card bg-base-100 border border-base-300 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table table-zebra">
            <thead>
              <tr>
                <th>Method</th>
                <th class="text-right">Transactions</th>
                <th class="text-right">Amount</th>
                <th class="text-right">Share</th>
                <th>Distribution</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let m of methods()">
                <td class="font-medium">{{ labelForMethod(m.method) }}</td>
                <td class="text-right">{{ m.paymentCount }}</td>
                <td class="text-right font-medium text-success">₹{{ m.totalAmount | number }}</td>
                <td class="text-right">{{ m.pctOfTotal | number:'1.1-1' }}%</td>
                <td class="w-48">
                  <div class="h-3 rounded bg-base-200 overflow-hidden">
                    <div class="h-full bg-info" [style.width.%]="m.pctOfTotal"></div>
                  </div>
                </td>
              </tr>
              <tr *ngIf="methods().length === 0">
                <td colspan="5" class="text-center opacity-60 py-8">No payments collected in this range.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </ng-container>
  `,
})
export class ReportsComponent implements OnInit {
  private api = inject(ReportsApiService);
  private branchesApi = inject(BranchesApiService);
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
  tab = signal<TabKey>('overview');
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

  seriesPeak = computed(() => Math.max(0, ...this.series().map((p) => p.paidAmount)));

  tabLabel = computed(() =>
    this.tab() === 'overview' ? 'overview' :
    this.tab() === 'period'   ? 'by-period' :
    this.tab() === 'student'  ? 'by-student' : 'by-method',
  );

  ngOnInit() {
    this.branchesApi.list().subscribe((bs) => this.branches.set(bs));
    this.applyPreset('month');
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
    }).subscribe({
      next: (r) => {
        this.summary.set(r.summary);
        this.series.set(r.series);
        this.students.set(r.students);
        this.methods.set(r.methods);
        this.aging.set(r.aging);
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
    this.api.timeseries({
      dateFrom: this.dateFrom, dateTo: this.dateTo, branchId: this.branchFilter, bucket: this.bucket(),
    }).subscribe((r) => this.series.set(r));
  }

  barWidth(amount: number): number {
    const max = this.seriesPeak();
    if (max <= 0) return 0;
    return Math.max(2, (amount / max) * 100);
  }

  agingBarWidth(b: AgingBucket): number {
    const a = this.aging();
    if (!a) return 0;
    const max = Math.max(...a.buckets.map((x) => x.totalAmount), 0);
    if (max <= 0) return 0;
    return Math.max(3, (b.totalAmount / max) * 100);
  }

  agingBarClass(bucket: string): string {
    switch (bucket) {
      case 'CURRENT':   return 'bg-success';
      case 'D_1_30':    return 'bg-warning';
      case 'D_31_60':   return 'bg-orange-500';
      case 'D_61_90':   return 'bg-error';
      case 'D_90_PLUS': return 'bg-red-700';
      default: return 'bg-base-300';
    }
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

  doExport(kind: 'csv' | 'pdf') {
    const subtitle = `${fmtDate(this.dateFrom)} – ${fmtDate(this.dateTo)}` +
      (this.branchFilter ? ` · Branch ${this.branchName(this.branchFilter)}` : ' · All branches');
    const t = this.tab();
    if (t === 'overview' || t === 'period') {
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
    } else {
      const cols: ExportColumn<MethodBreakdownRow>[] = [
        { header: 'Method',       value: (m) => this.labelForMethod(m.method) },
        { header: 'Transactions', value: (m) => m.paymentCount },
        { header: 'Amount (INR)', value: (m) => m.totalAmount },
        { header: 'Share %',      value: (m) => m.pctOfTotal },
      ];
      this.dispatch(kind, this.methods(), cols, 'Collections by method', subtitle, 'collections-by-method');
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
