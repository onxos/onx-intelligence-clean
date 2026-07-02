import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { WebhookSignatureService } from './webhook-signature.service';

const URL = 'https://api.onx.app/connectors/pos/webhook';

function baseReq(overrides: Record<string, unknown> = {}) {
  return {
    headers: {},
    protocol: 'https',
    originalUrl: '/connectors/pos/webhook',
    get: (name: string) => (name === 'host' ? 'api.onx.app' : undefined),
    ...overrides,
  } as any;
}

describe('WebhookSignatureService', () => {
  const svc = new WebhookSignatureService();

  afterEach(() => {
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.SQUARE_SIGNATURE_KEY;
  });

  describe('twilio', () => {
    const params = { From: 'whatsapp:+1', To: 'whatsapp:+2', Body: 'hi' };
    const url = 'https://api.onx.app/connectors/whatsapp/webhook';
    const req = (sig?: string) =>
      baseReq({
        originalUrl: '/connectors/whatsapp/webhook',
        body: params,
        headers: sig ? { 'x-twilio-signature': sig } : {},
      });
    const sign = (secret: string) => {
      const data =
        url +
        Object.keys(params)
          .sort()
          .map((k) => `${k}${(params as any)[k]}`)
          .join('');
      return createHmac('sha1', secret).update(data, 'utf8').digest('base64');
    };

    it('skips when no secret is configured', () => {
      expect(svc.verifyTwilio(req())).toMatchObject({ skipped: true });
    });

    it('verifies a valid signature', () => {
      process.env.TWILIO_AUTH_TOKEN = 'token';
      expect(svc.verifyTwilio(req(sign('token')))).toMatchObject({ verified: true });
    });

    it('rejects a bad signature', () => {
      process.env.TWILIO_AUTH_TOKEN = 'token';
      expect(() => svc.verifyTwilio(req('deadbeef'))).toThrow(UnauthorizedException);
    });

    it('rejects a missing signature when enforced', () => {
      process.env.TWILIO_AUTH_TOKEN = 'token';
      expect(() => svc.verifyTwilio(req())).toThrow(UnauthorizedException);
    });

    it('rejects a signature computed with the wrong secret', () => {
      process.env.TWILIO_AUTH_TOKEN = 'token';
      expect(() => svc.verifyTwilio(req(sign('other')))).toThrow(UnauthorizedException);
    });
  });

  describe('stripe', () => {
    const raw = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
    const req = (header?: string) =>
      baseReq({ rawBody: Buffer.from(raw), headers: header ? { 'stripe-signature': header } : {} });
    const sign = (secret: string, t = '1700000000') =>
      `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`, 'utf8').digest('hex')}`;

    it('skips when no secret is configured', () => {
      expect(svc.verifyStripe(req())).toMatchObject({ skipped: true });
    });

    it('verifies a valid signature', () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec';
      expect(svc.verifyStripe(req(sign('whsec')))).toMatchObject({ verified: true });
    });

    it('rejects a tampered payload', () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec';
      const good = sign('whsec');
      const tampered = baseReq({
        rawBody: Buffer.from(raw + 'x'),
        headers: { 'stripe-signature': good },
      });
      expect(() => svc.verifyStripe(tampered)).toThrow(UnauthorizedException);
    });

    it('rejects a malformed header', () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec';
      expect(() => svc.verifyStripe(req('garbage'))).toThrow(UnauthorizedException);
    });
  });

  describe('square', () => {
    const raw = JSON.stringify({ merchant_id: 'M1' });
    const req = (sig?: string) =>
      baseReq({
        rawBody: Buffer.from(raw),
        headers: sig ? { 'x-square-hmacsha256-signature': sig } : {},
      });
    const sign = (secret: string) =>
      createHmac('sha256', secret)
        .update(URL + raw, 'utf8')
        .digest('base64');

    it('skips when no secret is configured', () => {
      expect(svc.verifySquare(req())).toMatchObject({ skipped: true });
    });

    it('verifies a valid signature', () => {
      process.env.SQUARE_SIGNATURE_KEY = 'key';
      expect(svc.verifySquare(req(sign('key')))).toMatchObject({ verified: true });
    });

    it('rejects a bad signature', () => {
      process.env.SQUARE_SIGNATURE_KEY = 'key';
      expect(() => svc.verifySquare(req('nope'))).toThrow(UnauthorizedException);
    });
  });

  describe('verifyPos', () => {
    it('dispatches to stripe', () => {
      const spy = jest
        .spyOn(svc, 'verifyStripe')
        .mockReturnValue({ provider: 'stripe', verified: false, skipped: true });
      svc.verifyPos(baseReq(), 'stripe');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('dispatches to square by default', () => {
      const spy = jest
        .spyOn(svc, 'verifySquare')
        .mockReturnValue({ provider: 'square', verified: false, skipped: true });
      svc.verifyPos(baseReq(), 'square');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
