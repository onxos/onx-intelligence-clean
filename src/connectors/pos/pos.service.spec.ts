import { PosService } from './pos.service';
import { parseSquare } from './parsers/square.parser';
import { parseStripe } from './parsers/stripe.parser';

describe('POS parsers', () => {
  it('parseSquare reads nested payment money', () => {
    const t = parseSquare({
      type: 'payment.created',
      merchant_id: 'M1',
      data: {
        object: {
          payment: {
            id: 'sq-1',
            amount_money: { amount: 4500, currency: 'USD' },
            discount_percent: 10,
          },
        },
      },
    });
    expect(t.transactionId).toBe('sq-1');
    expect(t.amount).toBe(45);
    expect(t.currency).toBe('USD');
    expect(t.discountPercent).toBe(10);
    expect(t.account).toBe('M1');
    expect(t.isRefund).toBe(false);
  });

  it('parseStripe reads amount + metadata discount + refund', () => {
    const t = parseStripe({
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch-1',
          amount: 10000,
          currency: 'usd',
          refunded: true,
          metadata: { discount_percent: 40 },
        },
      },
    });
    expect(t.transactionId).toBe('ch-1');
    expect(t.amount).toBe(100);
    expect(t.currency).toBe('USD');
    expect(t.discountPercent).toBe(40);
    expect(t.isRefund).toBe(true);
  });
});

describe('PosService', () => {
  const makeService = () => {
    const connectors = {
      ingest: jest
        .fn()
        .mockResolvedValue({ logId: 'log-1', status: 'processed', usfipRecordId: 'r-1' }),
    } as any;
    const sech = {
      route: jest.fn().mockResolvedValue({
        status: 'REJECTED',
        id: 'sr-1',
        counterProposal: 'Cap discount at 30%.',
      }),
    } as any;
    return { connectors, sech, service: new PosService(connectors, sech) };
  };

  beforeEach(() => jest.clearAllMocks());

  it('routes discounts over 30% through the SECH DG-04 pre_execution gate', async () => {
    const { service, sech, connectors } = makeService();
    const result = await service.processWebhook('ws-1', 'square', {
      data: {
        object: {
          payment: {
            id: 'sq-2',
            amount_money: { amount: 2000, currency: 'USD' },
            discount_percent: 45,
          },
        },
      },
    });
    expect(sech.route).toHaveBeenCalledWith(
      'ws-1',
      'system-pos',
      expect.objectContaining({ checkType: 'pre_execution', signals: { discountGate: true } }),
      undefined,
    );
    expect(result.dg04).toMatchObject({ status: 'REJECTED', sechRouteId: 'sr-1' });
    expect(connectors.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        perception: expect.objectContaining({ signals: { discountGate: true } }),
      }),
      undefined,
    );
  });

  it('does not gate normal discounts', async () => {
    const { service, sech } = makeService();
    const result = await service.processWebhook('ws-1', 'square', {
      data: {
        object: {
          payment: {
            id: 'sq-3',
            amount_money: { amount: 2000, currency: 'USD' },
            discount_percent: 10,
          },
        },
      },
    });
    expect(sech.route).not.toHaveBeenCalled();
    expect(result.dg04).toBeNull();
  });

  it('ingests as commercial tier 1', async () => {
    const { service, connectors } = makeService();
    await service.processWebhook('ws-1', 'stripe', {
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi-1', amount: 5000, currency: 'usd' } },
    });
    expect(connectors.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        connector: 'pos',
        provider: 'stripe',
        perception: expect.objectContaining({ domain: 'commercial', tier: 1 }),
      }),
      undefined,
    );
  });

  it('flags refunds', async () => {
    const { service, connectors } = makeService();
    await service.processWebhook('ws-1', 'stripe', {
      type: 'charge.refunded',
      data: { object: { id: 'ch-2', amount: 1000, currency: 'usd', refunded: true } },
    });
    expect(connectors.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        perception: expect.objectContaining({ signals: { refundEvent: true } }),
      }),
      undefined,
    );
  });
});
