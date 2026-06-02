export enum AttendanceSource {
  QR = 'QR',
  MANUAL = 'MANUAL',
  BIOMETRIC = 'BIOMETRIC',
  SELF = 'SELF',
}

export interface Attendance {
  id: string;
  tenantId: string;
  branchId: string;
  studentId: string;
  date: string;
  checkInAt: string;
  checkOutAt: string | null;
  source: AttendanceSource;
}

export interface CheckInDto {
  qrCode: string; // student.qrCode scanned from device
  branchId: string;
  source?: AttendanceSource;
}
