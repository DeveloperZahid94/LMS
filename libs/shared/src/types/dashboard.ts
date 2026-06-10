export interface DashboardKpis {
  totalStudents: number;
  activeStudents: number;
  totalSeats: number;
  occupiedSeats: number;
  todayCheckIns: number;
  monthRevenue: number;
  duePaymentsCount: number;
  expiringSoonCount: number; // plans expiring in 7 days
  newStudentsThisMonth: number;
  expenseThisMonth: number;
  netThisMonth: number;          // monthRevenue - expenseThisMonth
  outstandingDuesAmount: number; // sum of PENDING payment amounts
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

export interface RecentStudent {
  id: string;
  fullName: string;
  code: string;
  status: string;
  createdAt: string;
}

export interface RecentPayment {
  id: string;
  amount: number;
  method: string;
  studentName: string;
  paidAt: string | null;
}

export interface DashboardRecent {
  students: RecentStudent[];
  payments: RecentPayment[];
}

export interface DashboardSummary {
  kpis: DashboardKpis;
  charts: DashboardCharts;
  recent: DashboardRecent;
}
