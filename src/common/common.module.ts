import { Global, Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from './prisma.service';
import { AuditService } from './audit.service';
import { WebhookEmitter } from './webhook.emitter';

@Global()
@Module({
  providers: [PrismaService, AuditService, EventEmitter2, WebhookEmitter],
  exports: [PrismaService, AuditService, WebhookEmitter],
})
export class CommonModule {}
