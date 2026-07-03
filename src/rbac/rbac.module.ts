/**
 * ONX RBAC Module
 * Complete role-based access control for ONX Intelligence
 */

import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RbacGuard } from './rbac.guard';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';

@Global()
@Module({
  controllers: [RbacController],
  providers: [
    RbacService,
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
  ],
  exports: [RbacService],
})
export class RbacModule {}
