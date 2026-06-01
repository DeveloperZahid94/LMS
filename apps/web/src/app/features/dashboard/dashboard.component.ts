import { Component, OnInit, inject, signal } from '@angular/core';
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
    <div class="mb-6">
      <h1 class="text-2xl font-bold">Dashboard</h1>
      <p class="text-sm opacity-60">Today at a glance.</p>
    </div>

    <ng-container *ngIf="summary() as s; else loading">
      <!-- KPI cards as DaisyUI stats -->
      <div class="stats stats-vertical sm:stats-horizontal shadow w-full mb-6 bg-base-100 border border-base-300">
        <div class="stat">
          <div class="stat-title">Active students</div>
          <div class="stat-value text-primary">{{ s.kpis.activeStudents }}</div>
          <div class="stat-desc">of {{ s.kpis.totalStudents }} total</div>
        </div>
        <div class="stat">
          <div class="stat-title">Seats occupied</div>
          <div class="stat-value">{{ s.kpis.occupiedSeats }} <span class="text-lg opacity-50">/ {{ s.kpis.totalSeats }}</span></div>
          <div class="stat-desc">{{ occupancyPct(s) }}% occupancy</div>
        </div>
        <div class="stat">
          <div class="stat-title">Today check-ins</div>
          <div class="stat-value text-secondary">{{ s.kpis.todayCheckIns }}</div>
          <div class="stat-desc">QR + manual</div>
        </div>
        <div class="stat">
          <div class="stat-title">Revenue this month</div>
          <div class="stat-value text-accent">₹{{ s.kpis.monthRevenue | number }}</div>
          <div class="stat-desc">{{ s.kpis.duePaymentsCount }} payments pending</div>
        </div>
        <div class="stat">
          <div class="stat-title">Expiring soon</div>
          <div class="stat-value text-warning">{{ s.kpis.expiringSoonCount }}</div>
          <div class="stat-desc">plans ending in 7 days</div>
        </div>
      </div>

      <div *lmsHasFeature="FeatureKey.ANALYTICS" class="grid grid-cols-1 lg:grid-cols-6 gap-4">
        <div class="card bg-base-100 border border-base-300 lg:col-span-2">
          <div class="card-body">
            <h3 class="card-title text-base">Attendance — last 7 days</h3>
            <div class="h-64">
              <canvas baseChart [data]="attendanceChart(s)" [type]="'line'" [options]="lineOpts"></canvas>
            </div>
          </div>
        </div>
        <div class="card bg-base-100 border border-base-300 lg:col-span-2">
          <div class="card-body">
            <h3 class="card-title text-base">Revenue — last 6 months</h3>
            <div class="h-64">
              <canvas baseChart [data]="revenueChart(s)" [type]="'bar'" [options]="barOpts"></canvas>
            </div>
          </div>
        </div>
        <div class="card bg-base-100 border border-base-300 lg:col-span-2">
          <div class="card-body">
            <h3 class="card-title text-base">Seats by zone</h3>
            <div class="h-64">
              <canvas baseChart [data]="zoneChart(s)" [type]="'doughnut'" [options]="doughnutOpts"></canvas>
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

  ngOnInit() {
    this.api.summary().subscribe((s) => this.summary.set(s));
  }

  occupancyPct(s: DashboardSummary): number {
    if (!s.kpis.totalSeats) return 0;
    return Math.round((s.kpis.occupiedSeats / s.kpis.totalSeats) * 100);
  }

  attendanceChart(s: DashboardSummary): ChartData<'line'> {
    return {
      labels: s.charts.attendanceLast7Days.map((p) => p.label.slice(5)),
      datasets: [
        {
          data: s.charts.attendanceLast7Days.map((p) => p.value),
          label: 'Check-ins',
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,.15)',
          tension: .3,
          fill: true,
        },
      ],
    };
  }

  revenueChart(s: DashboardSummary): ChartData<'bar'> {
    return {
      labels: s.charts.revenueLast6Months.map((p) => p.label),
      datasets: [{
        data: s.charts.revenueLast6Months.map((p) => p.value),
        backgroundColor: '#10b981',
        label: 'Revenue (₹)',
      }],
    };
  }

  zoneChart(s: DashboardSummary): ChartData<'doughnut'> {
    return {
      labels: s.charts.seatOccupancyByZone.map((p) => p.label),
      datasets: [{
        data: s.charts.seatOccupancyByZone.map((p) => p.value),
        backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#ef4444'],
      }],
    };
  }

  lineOpts: ChartConfiguration['options'] = { maintainAspectRatio: false, responsive: true, plugins: { legend: { display: false } } };
  barOpts: ChartConfiguration['options'] = { maintainAspectRatio: false, responsive: true, plugins: { legend: { display: false } } };
  doughnutOpts: ChartConfiguration['options'] = { maintainAspectRatio: false, responsive: true };
}
