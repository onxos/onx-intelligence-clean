import { Body, Controller, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '../../security/throttler.guard';
import { Throttle } from '../../security/throttle.decorator';
import { THROTTLER_CONFIG } from '../../security/throttler.config';
import { ConnectorsService } from '../connectors.service';
import { WebhookSignatureService } from '../webhook-signature.service';
import { WhatsAppService } from './whatsapp.service';
import type { TwilioWebhookPayload } from './whatsapp.types';

/**
 * Public Twilio WhatsApp webhook receiver. Unauthenticated (external caller);
 * the workspace is resolved from the destination number (settings.account) of
 * an active connector config, with an explicit ?workspaceId= fallback.
 *
 * TODO(security): validate the X-Twilio-Signature HMAC against the configured
 * auth token before trusting the payload in production.
 */
@ApiTags('Connectors — WhatsApp')
@Controller('connectors/whatsapp')
@UseGuards(ThrottlerGuard)
@Throttle(THROTTLER_CONFIG.webhooks)
export class WhatsAppController {
  constructor(
    private readonly connectors: ConnectorsService,
    private readonly whatsapp: WhatsAppService,
    private readonly signatures: WebhookSignatureService,
  ) {}

  @Post('webhook')
  @ApiOperation({ summary: 'Receive a Twilio WhatsApp webhook (public)' })
  @ApiOkResponse({ description: 'Acknowledgement returned fast (<5s) to Twilio.' })
  async webhook(
    @Req() req: any,
    @Body() payload: TwilioWebhookPayload,
    @Query('workspaceId') workspaceId?: string,
  ) {
    this.signatures.verifyTwilio(req);
    const resolved = await this.connectors.resolveWebhookWorkspace('whatsapp', {
      accountRef: payload?.To,
      workspaceId,
    });
    const result = await this.whatsapp.processWebhook(resolved, payload ?? {});
    return { received: true, ...result };
  }
}
