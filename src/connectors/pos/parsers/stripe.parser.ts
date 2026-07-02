import type { JsonRecord, ParsedTransaction } from '../../connectors.types';

function num(value: unknown): number {
  return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) || 0 : 0;
}
function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Parse a Stripe event webhook into the canonical ParsedTransaction. */
export function parseStripe(payload: JsonRecord): ParsedTransaction {
  const type = str(payload.type) ?? '';
  const data = (payload.data ?? {}) as JsonRecord;
  const object = (data.object ?? {}) as JsonRecord;
  const metadata = (object.metadata ?? {}) as JsonRecord;

  return {
    transactionId: str(object.id) ?? str(payload.id) ?? 'unknown',
    amount: num(object.amount) / 100,
    currency: (str(object.currency) ?? 'usd').toUpperCase(),
    discountPercent: num(metadata.discount_percent ?? payload.discountPercent),
    isRefund: type.includes('refund') || Boolean(object.refunded),
    account: str(payload.account) ?? str(metadata.account),
    raw: payload,
  };
}
