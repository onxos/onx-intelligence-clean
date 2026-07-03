/**
 * ONX Webhook Signature Guard
 * Reusable guard for HMAC signature verification across all connectors
 * Addresses Phase 5 Security Audit Gap: Webhook HMAC Signature Verification
 *
 * Usage:
 *   @UseGuards(WebhookSignatureGuard)
 *   @Post('webhook')
 *   handleWebhook(@Body() body, @Headers() headers, @Req() req) { ... }
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookSignatureService } from './webhook-signature.service';

export type WebhookProvider = 'twilio' | 'square' | 'stripe' | 'generic-hmac';

export interface WebhookGuardOptions {
  provider?: WebhookProvider;
  toleranceSeconds?: number;
}

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly signatureService: WebhookSignatureService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const provider = this.detectProvider(request);
    const secret = this.getSecret(provider);

    if (!secret) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[WebhookGuard] ${provider} secret not set, allowing in dev mode`);
        return true;
      }
      throw new UnauthorizedException('Webhook secret not configured');
    }

    const signature = this.extractSignature(request, provider);
    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const body = JSON.stringify(request.body);
    const url = `${request.protocol}://${request.get('host')}${request.originalUrl}`;

    const isValid = this.signatureService.verifySignature(
      provider,
      secret,
      signature,
      body,
      url,
      request.body,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    request.webhookProvider = provider;
    request.webhookVerified = true;

    return true;
  }

  private detectProvider(request: any): WebhookProvider {
    const pathProvider = request.params?.provider as WebhookProvider | undefined;
    if (pathProvider) return pathProvider;

    const userAgent = (request.headers['user-agent'] ?? '').toLowerCase();
    if (userAgent.includes('twilio')) return 'twilio';
    if (userAgent.includes('square')) return 'square';
    if (userAgent.includes('stripe')) return 'stripe';

    if (request.headers['x-twilio-signature']) return 'twilio';
    if (request.headers['x-square-signature']) return 'square';
    if (request.headers['stripe-signature']) return 'stripe';

    return 'generic-hmac';
  }

  private getSecret(provider: WebhookProvider): string | undefined {
    const envMap: Record<WebhookProvider, string> = {
      twilio: 'TWILIO_AUTH_TOKEN',
      square: 'SQUARE_WEBHOOK_SIGNATURE_KEY',
      stripe: 'STRIPE_WEBHOOK_SECRET',
      'generic-hmac': 'WEBHOOK_HMAC_SECRET',
    };
    return this.configService.get<string>(envMap[provider]);
  }

  private extractSignature(request: any, provider: WebhookProvider): string {
    const headerMap: Record<WebhookProvider, string> = {
      twilio: 'x-twilio-signature',
      square: 'x-square-signature',
      stripe: 'stripe-signature',
      'generic-hmac': 'x-webhook-signature',
    };
    return request.headers[headerMap[provider]] ?? '';
  }
}
