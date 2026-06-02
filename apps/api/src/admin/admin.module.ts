import { Module } from '@nestjs/common';
import { TenantsAdminController } from './tenants-admin.controller';
import { BranchesController } from './branches.controller';
import { AuditAdminController } from './audit-admin.controller';
import { DbConsoleController } from './db/db-console.controller';
import { TenantsAdminService } from './tenants-admin.service';
import { BranchesService } from './branches.service';
import { AuditAdminService } from './audit-admin.service';
import { DbConsoleService } from './db/db-console.service';

@Module({
  controllers: [
    TenantsAdminController,
    BranchesController,
    AuditAdminController,
    DbConsoleController,
  ],
  providers: [TenantsAdminService, BranchesService, AuditAdminService, DbConsoleService],
})
export class AdminModule {}
