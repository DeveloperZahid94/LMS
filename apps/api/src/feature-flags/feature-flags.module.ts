import { Global, Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagGuard } from './feature-flag.guard';

@Global()
@Module({
  providers: [FeatureFlagsService, FeatureFlagGuard],
  controllers: [FeatureFlagsController],
  exports: [FeatureFlagsService, FeatureFlagGuard],
})
export class FeatureFlagsModule {}
