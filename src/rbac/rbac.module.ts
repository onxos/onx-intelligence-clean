import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RbacController } from './rbac.controller';
import { RbacGuard } from './rbac.guard';
import { RbacService } from './rbac.service';

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
