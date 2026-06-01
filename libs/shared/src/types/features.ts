export enum FeatureKey {
  QR_ATTENDANCE = 'QR_ATTENDANCE',
  WHATSAPP = 'WHATSAPP',
  REPORTS = 'REPORTS',
  ANALYTICS = 'ANALYTICS',
  MULTI_BRANCH = 'MULTI_BRANCH',
  PAYMENT_GATEWAY = 'PAYMENT_GATEWAY',
  EXPORTS = 'EXPORTS',
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
};
