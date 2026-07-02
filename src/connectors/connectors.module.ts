import { Module } from '@nestjs/common';
import { PerceptionModule } from '../perception/perception.module';
import { SechModule } from '../sech/sech.module';
import { ConnectorsController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';
import { WebhookSignatureService } from './webhook-signature.service';
import { WhatsAppController } from './whatsapp/whatsapp.controller';
import { WhatsAppService } from './whatsapp/whatsapp.service';
import { EmrController } from './emr/emr.controller';
import { EmrService } from './emr/emr.service';
import { PosController } from './pos/pos.controller';
import { PosService } from './pos/pos.service';
import { CalendarController } from './calendar/calendar.controller';
import { CalendarService } from './calendar/calendar.service';

@Module({
  imports: [PerceptionModule, SechModule],
  controllers: [
    ConnectorsController,
    WhatsAppController,
    EmrController,
    PosController,
    CalendarController,
  ],
  providers: [
    ConnectorsService,
    WebhookSignatureService,
    WhatsAppService,
    EmrService,
    PosService,
    CalendarService,
  ],
  exports: [ConnectorsService],
})
export class ConnectorsModule {}
