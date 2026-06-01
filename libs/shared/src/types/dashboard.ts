export interface DashboardKpis {
  totalStudents: number;
  activeStudents: number;
  totalSeats: number;
  occupiedSeats: number;
  todayCheckIns: number;
  monthRevenue: number;
  duePaymentsCount: number;
  expiringSoonCount: number; // plans expiring in 7 days
}

export interface TimeSeriesPoint {
  label: string;   // e.g. "Mon", "Jan", "2026-05-23"
  value: number;
}

export interface DashboardCharts {
  attendanceLast7Days: TimeSeriesPoint[];
  revenueLast6Months: TimeSeriesPoint[];
  seatOccupancyByZone: TimeSeriesPoint[];
}

export interface DashboardSummary {
  kpis: DashboardKpis;
  charts: DashboardCharts;
}
