import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { Chart, registerables } from 'chart.js';
import { DashboardApiService } from './dashboard.service';
import { DashboardSummary } from '@lms/shared';
import { HasFeatureDirective } from '../../shared/directives/has-feature.directive';
import { FeatureKey } from '@lms/shared';

Chart.register(...registerables);

@Component({
  selector: 'lms-dashboard',
  standalone: true,
  imports: [CommonModule, NgChartsModule, HasFeatureDirective],
  template: `
    <div class="flex items-end justify-between gap-3 mb-6">
      <div>
        <h1 class="text-2xl font-bold">Dashboard</h1>
        <p class="text-sm opacity-60">Today at a glance.</p>
      </div>
      <div class="text-sm opacity-50 hidden sm:block">{{ today | date:'EEEE, dd MMM yyyy' }}</div>
    </div>

    <ng-container *ngIf="summary() as s; else loading">
      <div class="space-y-6">
        <!-- Top row: compact KPI tiles + income/expense donut beside them -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <!-- Compact KPI tiles -->
          <div class="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div *ngFor="let k of kpiTiles(s)"
                 class="card bg-base-100 border border-base-300 rounded-2xl shadow-sm">
              <div class="card-body p-4 flex-row items-center gap-3">
                <span class="w-11 h-11 rounded-xl grid place-items-center text-xl shrink-0 bg-opacity-10"
                      [ngClass]="k.chip">{{ k.icon }}</span>
                <div class="min-w-0">
                  <div class="text-[11px] uppercase tracking-wider opacity-60 truncate">{{ k.label }}</div>
                  <div class="text-2xl font-bold leading-tight" [ngClass]="k.valueClass">{{ k.value }}</div>
                  <div class="text-[11px] opacity-50 truncate">{{ k.sub }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Income vs Expense donut -->
          <div class="card bg-base-100 border border-base-300 rounded-2xl shadow-sm">
            <div class="card-body p-5">
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">Income vs Expense</h3>
                <span class="text-[11px] uppercase tracking-wider opacity-50">This month</span>
              </div>
              <div class="h-40 my-2">
                <canvas baseChart [data]="incomeExpenseChart()" [type]="'doughnut'" [options]="doughnutOpts"></canvas>
              </div>
              <div class="space-y-1.5 text-sm">
                <div class="flex items-center justify-between">
                  <span class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-success"></span> Income</span>
                  <span class="font-semibold">₹{{ s.kpis.monthRevenue | number }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-error"></span> Expense</span>
                  <span class="font-semibold">₹{{ s.kpis.expenseThisMonth | number }}</span>
                </div>
                <div class="flex items-center justify-between pt-2 mt-1 border-t border-base-200">
                  <span class="opacity-60">Net</span>
                  <span class="font-bold" [class.text-success]="s.kpis.netThisMonth >= 0" [class.text-error]="s.kpis.netThisMonth < 0">
                    ₹{{ s.kpis.netThisMonth | number }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Recent activity -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="card bg-base-100 border border-base-300 rounded-2xl shadow-sm">
            <div class="card-body p-5">
              <h3 class="font-semibold flex items-center gap-2 mb-1">
                <span class="text-base">🧑‍🎓</span> Recently added students
              </h3>
              <table class="table table-sm">
                <thead>
                  <tr class="text-[11px] uppercase tracking-wider opacity-50">
                    <th>Name</th><th>Code</th><th>Status</th><th class="text-right">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let st of s.recent.students" class="hover">
                    <td class="font-medium">{{ st.fullName }}</td>
                    <td><code class="text-xs opacity-70">{{ st.code }}</code></td>
                    <td>
                      <span class="badge badge-sm"
                            [class.badge-success]="st.status==='ACTIVE'"
                            [class.badge-info]="st.status==='PENDING'"
                            [class.badge-warning]="st.status==='SUSPENDED'"
                            [class.badge-ghost]="st.status==='INACTIVE'">{{ st.status | titlecase }}</span>
                    </td>
                    <td class="text-right text-xs opacity-60 whitespace-nowrap">{{ st.createdAt | date:'dd MMM' }}</td>
                  </tr>
                  <tr *ngIf="s.recent.students.length === 0">
                    <td colspan="4" class="text-center opacity-50 py-8">No students yet.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="card bg-base-100 border border-base-300 rounded-2xl shadow-sm">
            <div class="card-body p-5">
              <h3 class="font-semibold flex items-center gap-2 mb-1">
                <span class="text-base">💸</span> Recent payments
              </h3>
              <table class="table table-sm">
                <thead>
                  <tr class="text-[11px] uppercase tracking-wider opacity-50">
                    <th>Student</th><th>Method</th><th class="text-right">Amount</th><th class="text-right">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let p of s.recent.payments" class="hover">
                    <td class="font-medium">{{ p.studentName }}</td>
                    <td><span class="badge badge-ghost badge-sm">{{ p.method }}</span></td>
                    <td class="text-right font-semibold whitespace-nowrap">₹{{ p.amount | number }}</td>
                    <td class="text-right text-xs opacity-60 whitespace-nowrap">{{ p.paidAt ? (p.paidAt | date:'dd MMM') : '—' }}</td>
                  </tr>
                  <tr *ngIf="s.recent.payments.length === 0">
                    <td colspan="4" class="text-center opacity-50 py-8">No payments yet.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Analytics -->
        <div *lmsHasFeature="FeatureKey.ANALYTICS">
          <h2 class="text-[11px] uppercase tracking-wider opacity-50 font-semibold mb-3">Analytics</h2>
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div class="card bg-base-100 border border-base-300 rounded-2xl shadow-sm">
              <div class="card-body p-5">
                <h3 class="font-semibold text-sm mb-1">Attendance · last 7 days</h3>
                <div class="h-60"><canvas baseChart [data]="attendanceChart()" [type]="'line'" [options]="lineOpts"></canvas></div>
              </div>
            </div>
            <div class="card bg-base-100 border border-base-300 rounded-2xl shadow-sm">
              <div class="card-body p-5">
                <h3 class="font-semibold text-sm mb-1">Revenue · last 6 months</h3>
                <div class="h-60"><canvas baseChart [data]="revenueChart()" [type]="'bar'" [options]="barOpts"></canvas></div>
              </div>
            </div>
            <div class="card bg-base-100 border border-base-300 rounded-2xl shadow-sm">
              <div class="card-body p-5">
                <h3 class="font-semibold text-sm mb-1">Seats by zone</h3>
                <div class="h-60"><canvas baseChart [data]="zoneChart()" [type]="'doughnut'" [options]="donutLegendOpts"></canvas></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ng-container>

    <ng-template #loading>
      <div class="card bg-base-100 border border-base-300">
        <div class="card-body items-center">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      </div>
    </ng-template>
  `,
})
export class DashboardComponent implements OnInit {
  private api = inject(DashboardApiService);
  summary = signal<DashboardSummary | null>(null);
  FeatureKey = FeatureKey;
  today = new Date();

  ngOnInit() {
    this.api.summary().subscribe((s) => this.summary.set(s));
  }

  occupancyPct(s: DashboardSummary): number {
    if (!s.kpis.totalSeats) return 0;
    return Math.round((s.kpis.occupiedSeats / s.kpis.totalSeats) * 100);
  }

  /** The six headline KPIs, rendered as uniform icon tiles for clean alignment. */
  kpiTiles(s: DashboardSummary) {
    const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
    const k = s.kpis;
    return [
      { label: 'Active students', value: `${k.activeStudents}`, sub: `of ${k.totalStudents} total`, icon: '👥', chip: 'bg-primary text-primary', valueClass: 'text-primary' },
      { label: 'Seats occupied', value: `${k.occupiedSeats} / ${k.totalSeats}`, sub: `${this.occupancyPct(s)}% occupancy`, icon: '🪑', chip: 'bg-info text-info', valueClass: '' },
      { label: 'Today check-ins', value: `${k.todayCheckIns}`, sub: 'QR + manual', icon: '✅', chip: 'bg-secondary text-secondary', valueClass: 'text-secondary' },
      { label: 'New students', value: `${k.newStudentsThisMonth}`, sub: 'joined this month', icon: '✨', chip: 'bg-success text-success', valueClass: '' },
      { label: 'Outstanding dues', value: inr(k.outstandingDuesAmount), sub: `${k.duePaymentsCount} pending`, icon: '💰', chip: 'bg-warning text-warning', valueClass: 'text-warning' },
      { label: 'Expiring soon', value: `${k.expiringSoonCount}`, sub: 'plans ending in 7 days', icon: '⏳', chip: 'bg-error text-error', valueClass: 'text-error' },
    ];
  }

  // Chart data is built as memoized computed signals — NOT methods called from
  // the template. A method returns a fresh object reference on every change-
  // detection pass, which makes ng2-charts think the data changed and re-render
  // (and re-animate) the charts repeatedly. A computed only recomputes when
  // `summary()` actually changes, so the reference stays stable.
  attendanceChart = computed<ChartData<'line'>>(() => {
    const s = this.summary();
    if (!s) return { labels: [], datasets: [] };
    return {
      labels: s.charts.attendanceLast7Days.map((p) => p.label.slice(5)),
      datasets: [{
        data: s.charts.attendanceLast7Days.map((p) => p.value),
        label: 'Check-ins',
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,.15)',
        tension: .3,
        fill: true,
      }],
    };
  });

  revenueChart = computed<ChartData<'bar'>>(() => {
    const s = this.summary();
    if (!s) return { labels: [], datasets: [] };
    return {
      labels: s.charts.revenueLast6Months.map((p) => p.label),
      datasets: [{
        data: s.charts.revenueLast6Months.map((p) => p.value),
        backgroundColor: '#10b981',
        label: 'Revenue (₹)',
      }],
    };
  });

  zoneChart = computed<ChartData<'doughnut'>>(() => {
    const s = this.summary();
    if (!s) return { labels: [], datasets: [] };
    return {
      labels: s.charts.seatOccupancyByZone.map((p) => p.label),
      datasets: [{
        data: s.charts.seatOccupancyByZone.map((p) => p.value),
        backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#ef4444'],
      }],
    };
  });

  /** Income (this month's collected revenue) vs this month's expenses. */
  incomeExpenseChart = computed<ChartData<'doughnut'>>(() => {
    const s = this.summary();
    if (!s) return { labels: [], datasets: [] };
    return {
      labels: ['Income', 'Expense'],
      datasets: [{
        data: [s.kpis.monthRevenue, s.kpis.expenseThisMonth],
        backgroundColor: ['#10b981', '#ef4444'],
        borderWidth: 0,
      }],
    };
  });

  lineOpts: ChartConfiguration['options'] = { maintainAspectRatio: false, responsive: true, animation: false, plugins: { legend: { display: false } } };
  barOpts: ChartConfiguration['options'] = { maintainAspectRatio: false, responsive: true, animation: false, plugins: { legend: { display: false } } };
  doughnutOpts: ChartConfiguration['options'] = { maintainAspectRatio: false, responsive: true, animation: false };
  donutLegendOpts: ChartConfiguration['options'] = { maintainAspectRatio: false, responsive: true, animation: false, plugins: { legend: { position: 'bottom' } } };
}
