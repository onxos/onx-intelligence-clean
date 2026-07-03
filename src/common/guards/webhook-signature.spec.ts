import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { WebhookSignatureService } from './webhook-signature.service';

describe('WebhookSignatureService', () => {
  let service: WebhookSignatureService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhookSignatureService],
    }).compile();
    service = module.get<WebhookSignatureService>(WebhookSignatureService);
  });

  describe('verifyTwilio', () => {
    const authToken = 'test_auth_token_12345';
    const url = 'https://api.onx.io/connectors/whatsapp/webhook';

    it('should verify valid Twilio signature', () => {
      const params = { MessageSid: 'SM123', From: '+1234567890', Body: 'Hello' };
      const sortedKeys = Object.keys(params).sort();
      const payload = url + sortedKeys.map(k => k + params[k]).join('');
      const signature = createHmac('sha1', authToken).update(payload).digest('base64');
      expect(service.verifySignature('twilio', authToken, signature, '', url, params)).toBe(true);
    });

    it('should reject invalid Twilio signature', () => {
      expect(service.verifySignature('twilio', authToken, 'invalid', '', url, {})).toBe(false);
    });
  });

  describe('verifySquare', () => {
    const key = 'sq0idp-test-key';
    const body = JSON.stringify({ type: 'payment.created' });

    it('should verify valid Square signature', () => {
      const signature = createHmac('sha256', key).update(body).digest('base64');
      expect(service.verifySignature('square', key, signature, body, '', {})).toBe(true);
    });

    it('should reject tampered body', () => {
      const signature = createHmac('sha256', key).update(body).digest('base64');
      expect(service.verifySignature('square', key, signature, body + 'tamper', '', {})).toBe(false);
    });
  });

  describe('verifyStripe', () => {
    const secret = 'whsec_test_secret';

    it('should verify valid Stripe signature', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({ id: 'evt_123' });
      const payload = `${timestamp}.${body}`;
      const signature = createHmac('sha256', secret).update(payload).digest('hex');
      const header = `t=${timestamp},v1=${signature}`;
      expect(service.verifySignature('stripe', secret, header, body, '', {})).toBe(true);
    });

    it('should reject expired timestamp', () => {
      const oldTs = Math.floor(Date.now() / 1000) - 1000;
      const body = '{}';
      const payload = `${oldTs}.${body}`;
      const signature = createHmac('sha256', secret).update(payload).digest('hex');
      const header = `t=${oldTs},v1=${signature}`;
      expect(service.verifySignature('stripe', secret, header, body, '', {})).toBe(false);
    });
  });

  describe('timing attack resistance', () => {
    it('should have similar timing for valid and invalid', () => {
      const secret = 'timing_test';
      const body = 'payload';
      const validSig = createHmac('sha256', secret).update(body).digest('hex');

      const iterations = 50;
      let validTime = 0, invalidTime = 0;

      for (let i = 0; i < iterations; i++) {
        const t1 = process.hrtime.bigint();
        service.verifySignature('generic-hmac', secret, validSig, body, '', {});
        validTime += Number(process.hrtime.bigint() - t1);
      }

      for (let i = 0; i < iterations; i++) {
        const t1 = process.hrtime.bigint();
        service.verifySignature('generic-hmac', secret, 'a'.repeat(64), body, '', {});
        invalidTime += Number(process.hrtime.bigint() - t1);
      }

      const ratio = Math.max(validTime, invalidTime) / Math.min(validTime, invalidTime);
      expect(ratio).toBeLessThan(3);
    });
  });
});

describe('WebhookSignatureGuard', () => {
  let guard: WebhookSignatureGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookSignatureGuard,
        WebhookSignatureService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    guard = module.get<WebhookSignatureGuard>(WebhookSignatureGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });
});
