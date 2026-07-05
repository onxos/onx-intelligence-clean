import { Module } from '@nestjs/common';
import { ConnectorController } from './connector.controller';
import { ConnectorService } from './connector.service';
import { MessagingService } from './messaging.service';
import { PaymentService } from './payment.service';
import { CalendarService } from './calendar.service';
import { EmrService } from './emr.service';

@Module({
  controllers: [ConnectorController],
  providers: [ConnectorService, MessagingService, PaymentService, CalendarService, EmrService],
  exports: [ConnectorService, MessagingService, PaymentService, CalendarService, EmrService],
})
export class ConnectorModule {}
