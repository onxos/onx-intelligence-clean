/**
 * ONX Webhook Signature Service
 * Standalone service for HMAC signature verification
 */

import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { WebhookProvider } from './webhook-signature.guard';

@Injectable()
export class WebhookSignatureService {
  verifySignature(
    provider: WebhookProvider,
    secret: string,
    signature: string,
    body: string,
    url: string,
    params: Record<string, unknown>,
  ): boolean {
    switch (provider) {
      case 'twilio':
        return this.verifyTwilio(secret, url, params, signature);
      case 'square':
        return this.verifySquare(secret, body, signature);
      case 'stripe':
        return this.verifyStripe(secret, body, signature);
      default:
        return this.verifyGeneric(secret, body, signature);
    }
  }

  private verifyTwilio(
    authToken: string,
    url: string,
    params: Record<string, unknown>,
    signature: string,
  ): boolean {
    const sortedKeys = Object.keys(params).sort();
    const payload = url + sortedKeys.map(k => k + (params[k] ?? '')).join('');
    const expected = createHmac('sha1', authToken).update(payload).digest('base64');
    return this.timingSafeCompare(signature, expected, 'base64');
  }

  private verifySquare(
    signatureKey: string,
    body: string,
    signature: string,
  ): boolean {
    const expected = createHmac('sha256', signatureKey).update(body).digest('base64');
    return this.timingSafeCompare(signature, expected, 'base64');
  }

  private verifyStripe(
    secret: string,
    body: string,
    signatureHeader: string,
  ): boolean {
    const elements = signatureHeader.split(',').reduce(
      (acc, el) => {
        const [key, value] = el.split('=');
        if (key && value) acc[key.trim()] = value.trim();
        return acc;
      },
      {} as Record<string, string>,
    );

    const timestamp = parseInt(elements['t'], 10);
    const v1Signatures = signatureHeader
      .split(',')
      .filter(el => el.startsWith('v1='))
      .map(el => el.slice(3));

    if (!timestamp || v1Signatures.length === 0) return false;

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) return false;

    const payload = `${timestamp}.${body}`;
    const expected = createHmac('sha256', secret).update(payload).digest('hex');

    return v1Signatures.some(sig => this.timingSafeCompare(sig, expected, 'hex'));
  }

  private verifyGeneric(
    secret: string,
    body: string,
    signature: string,
  ): boolean {
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    return this.timingSafeCompare(signature, expected, 'hex');
  }

  private timingSafeCompare(a: string, b: string, encoding: 'hex' | 'base64'): boolean {
    try {
      const bufA = Buffer.from(a, encoding);
      const bufB = Buffer.from(b, encoding);
      if (bufA.length !== bufB.length) return false;
      return timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }
}
