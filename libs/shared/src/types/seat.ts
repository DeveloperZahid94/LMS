export enum SeatType {
  SEAT = 'SEAT',
  CABIN = 'CABIN',
  HOT_DESK = 'HOT_DESK',
}

export enum Shift {
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
  EVENING = 'EVENING',
  NIGHT = 'NIGHT',
  FULL_DAY = 'FULL_DAY',
}

export const ALL_SHIFTS: Shift[] = [
  Shift.MORNING, Shift.AFTERNOON, Shift.EVENING, Shift.NIGHT, Shift.FULL_DAY,
];

export const SHIFT_LABELS: Record<Shift, string> = {
  [Shift.MORNING]:   'Morning (6 AM – 12 PM)',
  [Shift.AFTERNOON]: 'Afternoon (12 PM – 6 PM)',
  [Shift.EVENING]:   'Evening (6 PM – 10 PM)',
  [Shift.NIGHT]:     'Night (10 PM – 6 AM)',
  [Shift.FULL_DAY]:  'Full day (24 hours)',
};

/** Standard amenities — admin can add more free-form. */
export const COMMON_AMENITIES = [
  'AC', 'wifi', 'power', 'locker', 'water', '24x7', 'silent zone', 'near washroom',
] as const;

export type MonthlyRates = Partial<Record<Shift, number>>;

export interface Seat {
  id: string;
  tenantId: string;
  branchId: string;
  code: string;
  type: SeatType;
  floor: string | null;
  zone: string | null;
  amenities: string[];
  monthlyRates: MonthlyRates | null;
  notes: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateSeatDto {
  branchId: string;
  code: string;
  type: SeatType;
  floor?: string;
  zone?: string;
  amenities?: string[];
  monthlyRates?: MonthlyRates;
  notes?: string;
  isActive?: boolean;
}

export enum SeatAssignmentStatus {
  TEMPORARY = 'TEMPORARY',
  CONFIRMED = 'CONFIRMED',
  ENDED = 'ENDED',
}

export interface SeatAssignment {
  id: string;
  tenantId: string;
  seatId: string;
  studentId: string;
  shift: Shift;
  startDate: string;
  endDate: string | null;
  status: SeatAssignmentStatus;
  monthlyRate: number | null;
  nextDueDate: string | null;
  createdAt: string;

  // Hydrated relations (from the API)
  seat?: { id: string; code: string; type: SeatType; branchId: string; zone?: string | null; floor?: string | null };
  student?: { id: string; code: string; fullName: string; phone: string };

  // Computed by API
  paidAmount?: number;
  paidPct?: number;
}

export interface CreateSeatAssignmentDto {
  seatId: string;
  studentId: string;
  shift: Shift;
  startDate: string;
  endDate?: string;
}
