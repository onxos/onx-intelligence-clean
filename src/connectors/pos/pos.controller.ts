import { Body, Controller, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '../../security/throttler.guard';
import { Throttle } from '../../security/throttle.decorator';
import { THROTTLER_CONFIG } from '../../security/throttler.config';
import { ConnectorsService } from '../connectors.service';
import { WebhookSignatureService } from '../webhook-signature.service';
import { PosService } from './pos.service';
import type { PosWebhookPayload } from './pos.types';

/**
 * Public POS webhook receiver (Square / Stripe). The provider is auto-detected
 * from the event shape (falling back to ?provider=), and the workspace is
 * resolved from the merchant/account of an active connector config.
 *
 * TODO(security): verify the Square/Stripe signature header before trusting the
 * payload in production.
 */
@ApiTags('Connectors — POS')
@Controller('connectors/pos')
@UseGuards(ThrottlerGuard)
@Throttle(THROTTLER_CONFIG.webhooks)
export class PosController {
  constructor(
    private readonly connectors: ConnectorsService,
    private readonly pos: PosService,
    private readonly signatures: WebhookSignatureService,
  ) {}

  private detectProvider(payload: PosWebhookPayload, hint?: string): string {
    if (hint) return hint.toLowerCase();
    const type = typeof payload?.type === 'string' ? payload.type : '';
    if (
      type.startsWith('payment_intent') ||
      type.startsWith('charge') ||
      'account' in (payload ?? {})
    ) {
      return 'stripe';
    }
    return 'square';
  }

  private accountRef(payload: PosWebhookPayload): string | undefined {
    const merchant = payload?.merchant_id ?? payload?.account;
    return typeof merchant === 'string' ? merchant : undefined;
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Receive a Square/Stripe POS webhook (public)' })
  @ApiOkResponse({ description: 'Ingestion result including any DG-04 discount gate outcome.' })
  async webhook(
    @Req() req: any,
    @Body() payload: PosWebhookPayload,
    @Query('provider') provider?: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const resolvedProvider = this.detectProvider(payload ?? {}, provider);
    this.signatures.verifyPos(req, resolvedProvider);
    const resolved = await this.connectors.resolveWebhookWorkspace('pos', {
      accountRef: this.accountRef(payload ?? {}),
      workspaceId,
    });
    const result = await this.pos.processWebhook(resolved, resolvedProvider, payload ?? {});
    return { received: true, provider: resolvedProvider, ...result };
  }
}
