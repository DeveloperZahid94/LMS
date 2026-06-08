export enum FeatureKey {
  QR_ATTENDANCE = 'QR_ATTENDANCE',
  WHATSAPP = 'WHATSAPP',
  REPORTS = 'REPORTS',
  ANALYTICS = 'ANALYTICS',
  MULTI_BRANCH = 'MULTI_BRANCH',
  PAYMENT_GATEWAY = 'PAYMENT_GATEWAY',
  EXPORTS = 'EXPORTS',
  PG_ROOMS = 'PG_ROOMS',
  TIFFIN = 'TIFFIN',
  // Menu-visibility flags (let SuperAdmin show/hide core sidebar items per tenant).
  DASHBOARD = 'DASHBOARD',
  STUDENTS = 'STUDENTS',
  SEATS = 'SEATS',
  ALERTS = 'ALERTS',
  SETTINGS = 'SETTINGS',
}

export interface FeatureFlag {
  key: FeatureKey;
  enabled: boolean;
  config?: Record<string, unknown>;
}

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  [FeatureKey.QR_ATTENDANCE]: 'QR Attendance',
  [FeatureKey.WHATSAPP]: 'WhatsApp Notifications',
  [FeatureKey.REPORTS]: 'Reports',
  [FeatureKey.ANALYTICS]: 'Analytics',
  [FeatureKey.MULTI_BRANCH]: 'Multi-branch',
  [FeatureKey.PAYMENT_GATEWAY]: 'Payment Gateway',
  [FeatureKey.EXPORTS]: 'Data Exports',
  [FeatureKey.PG_ROOMS]: 'PG Rooms',
  [FeatureKey.TIFFIN]: 'Tiffin Service',
  [FeatureKey.DASHBOARD]: 'Dashboard',
  [FeatureKey.STUDENTS]: 'Students',
  [FeatureKey.SEATS]: 'Seats',
  [FeatureKey.ALERTS]: 'Alerts',
  [FeatureKey.SETTINGS]: 'Settings',
};
