import type { JsonRecord, ParsedTransaction } from '../../connectors.types';

function num(value: unknown): number {
  return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) || 0 : 0;
}
function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Parse a Square payment webhook into the canonical ParsedTransaction. */
export function parseSquare(payload: JsonRecord): ParsedTransaction {
  const type = str(payload.type) ?? '';
  const data = (payload.data ?? {}) as JsonRecord;
  const object = (data.object ?? {}) as JsonRecord;
  const payment = (object.payment ?? object) as JsonRecord;
  const money = (payment.amount_money ?? {}) as JsonRecord;

  return {
    transactionId: str(payment.id) ?? str(payload.event_id) ?? 'unknown',
    amount: num(money.amount) / (money.amount ? 100 : 1) || num(payment.amount),
    currency: str(money.currency) ?? 'USD',
    discountPercent: num(payment.discount_percent ?? payload.discountPercent),
    isRefund: type.includes('refund'),
    account: str(payload.merchant_id) ?? str(object.location_id),
    raw: payload,
  };
}
