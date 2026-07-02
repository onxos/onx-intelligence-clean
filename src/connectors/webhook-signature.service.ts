import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

interface SignableRequest {
  headers: Record<string, unknown>;
  rawBody?: Buffer | string;
  body?: unknown;
  protocol?: string;
  originalUrl?: string;
  get?: (name: string) => string | undefined;
}

export interface VerificationResult {
  provider: string;
  verified: boolean;
  skipped: boolean;
  reason?: string;
}

/** Env var holding the shared secret for each provider's webhook signature. */
export const WEBHOOK_SECRET_ENV = {
  twilio: 'TWILIO_AUTH_TOKEN',
  stripe: 'STRIPE_WEBHOOK_SECRET',
  square: 'SQUARE_SIGNATURE_KEY',
} as const;

/**
 * Phase 5 (Condition 3) — webhook signature verification.
 *
 * Validates the provider HMAC over the incoming payload before it is trusted.
 * When the provider secret env var is unset the check is SKIPPED (dev mode) so
 * local/test webhooks keep working; when it is set, a bad or missing signature
 * throws 401. All comparisons are timing-safe.
 *
 * Requires the raw request body — capture it in main.ts via
 * `express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf; } })`.
 */
@Injectable()
export class WebhookSignatureService {
  /** Twilio: base64(HMAC-SHA1(authToken, fullUrl + sorted(key+value) params)). */
  verifyTwilio(req: SignableRequest): VerificationResult {
    const secret = process.env[WEBHOOK_SECRET_ENV.twilio];
    if (!secret) return { provider: 'twilio', verified: false, skipped: true, reason: 'no_secret' };

    const signature = header(req, 'x-twilio-signature');
    const url = fullUrl(req);
    const params = (req.body ?? {}) as Record<string, unknown>;
    const data =
      url +
      Object.keys(params)
        .sort()
        .map((k) => `${k}${stringifyValue(params[k])}`)
        .join('');
    const expected = createHmac('sha1', secret).update(data, 'utf8').digest('base64');
    return this.assert('twilio', signature, expected);
  }

  /** Stripe: header t=<ts>,v1=<hex sha256 of `${t}.${rawBody}`>. */
  verifyStripe(req: SignableRequest): VerificationResult {
    const secret = process.env[WEBHOOK_SECRET_ENV.stripe];
    if (!secret) return { provider: 'stripe', verified: false, skipped: true, reason: 'no_secret' };

    const header = stripeHeader(req);
    if (!header.t || header.v1.length === 0) {
      throw new UnauthorizedException('Invalid Stripe-Signature header');
    }
    const signedPayload = `${header.t}.${rawBody(req)}`;
    const expected = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
    const ok = header.v1.some((sig) => timingSafeEqualStr(sig, expected));
    if (!ok) throw new UnauthorizedException('Stripe signature mismatch');
    return { provider: 'stripe', verified: true, skipped: false };
  }

  /** Square: base64(HMAC-SHA256(signatureKey, notificationUrl + rawBody)). */
  verifySquare(req: SignableRequest): VerificationResult {
    const secret = process.env[WEBHOOK_SECRET_ENV.square];
    if (!secret) return { provider: 'square', verified: false, skipped: true, reason: 'no_secret' };

    const signature = header(req, 'x-square-hmacsha256-signature');
    const data = fullUrl(req) + rawBody(req);
    const expected = createHmac('sha256', secret).update(data, 'utf8').digest('base64');
    return this.assert('square', signature, expected);
  }

  /** Verify a POS webhook using the detected provider. */
  verifyPos(req: SignableRequest, provider: string): VerificationResult {
    return provider === 'stripe' ? this.verifyStripe(req) : this.verifySquare(req);
  }

  private assert(
    provider: string,
    signature: string | undefined,
    expected: string,
  ): VerificationResult {
    if (!signature) throw new UnauthorizedException(`Missing ${provider} signature`);
    if (!timingSafeEqualStr(signature, expected)) {
      throw new UnauthorizedException(`${provider} signature mismatch`);
    }
    return { provider, verified: true, skipped: false };
  }
}

function header(req: SignableRequest, name: string): string | undefined {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return typeof value === 'string' ? value : Array.isArray(value) ? String(value[0]) : undefined;
}

function fullUrl(req: SignableRequest): string {
  const host = req.get?.('host') ?? header(req, 'host') ?? '';
  const proto = req.protocol ?? 'https';
  return `${proto}://${host}${req.originalUrl ?? ''}`;
}

function rawBody(req: SignableRequest): string {
  if (req.rawBody) return req.rawBody.toString();
  return req.body ? JSON.stringify(req.body) : '';
}

function stripeHeader(req: SignableRequest): { t?: string; v1: string[] } {
  const raw = header(req, 'stripe-signature') ?? '';
  const parts = raw.split(',').map((p) => p.trim());
  const out: { t?: string; v1: string[] } = { v1: [] };
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k === 't') out.t = v;
    if (k === 'v1' && v) out.v1.push(v);
  }
  return out;
}

function stringifyValue(value: unknown): string {
  return typeof value === 'string'
    ? value
    : value === undefined || value === null
      ? ''
      : String(value);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
