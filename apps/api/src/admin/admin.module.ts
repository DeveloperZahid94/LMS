import { Module } from '@nestjs/common';
import { TenantsAdminController } from './tenants-admin.controller';
import { BranchesController } from './branches.controller';
import { TenantsAdminService } from './tenants-admin.service';
import { BranchesService } from './branches.service';

@Module({
  controllers: [TenantsAdminController, BranchesController],
  providers: [TenantsAdminService, BranchesService],
})
export class AdminModule {}
