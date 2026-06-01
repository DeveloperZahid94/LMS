import { SetMetadata } from '@nestjs/common';
import { FeatureKey } from '@lms/shared';

export const FEATURE_KEY = 'requiredFeature';
export const RequireFeature = (key: FeatureKey) => SetMetadata(FEATURE_KEY, key);
