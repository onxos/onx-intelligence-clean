import { Injectable } from '@nestjs/common';
import { ConnectorsService } from '../connectors.service';
import { SechRouterService } from '../../sech/sech-router.service';
import { DG04_DISCOUNT_THRESHOLD } from '../connectors.constants';
import { POS_DOMAIN, POS_TIER } from './pos.constants';
import { parseSquare } from './parsers/square.parser';
import { parseStripe } from './parsers/stripe.parser';
import type { JsonRecord, ParsedTransaction } from '../connectors.types';
import type { PosWebhookPayload } from './pos.types';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const REQUESTER = 'system-pos';

@Injectable()
export class PosService {
  constructor(
    private readonly connectors: ConnectorsService,
    private readonly sech: SechRouterService,
  ) {}

  parse(provider: string, payload: JsonRecord): ParsedTransaction {
    return provider === 'stripe' ? parseStripe(payload) : parseSquare(payload);
  }

  /**
   * Process a POS webhook. Transactions with a discount above the DG-04
   * threshold (30%) are routed through the SECH pre_execution gate before the
   * event is committed to the USFIP bus (tier 1, commercial).
   */
  async processWebhook(
    workspaceId: string,
    provider: string,
    payload: PosWebhookPayload,
    ctx?: MutationAuditContext,
  ) {
    const txn = this.parse(provider, payload as JsonRecord);
    const signals: Record<string, boolean | number> = {};
    let dg04: { status: string; sechRouteId: string; counterProposal: string | null } | null = null;

    if (txn.discountPercent > DG04_DISCOUNT_THRESHOLD) {
      signals.discountGate = true;
      const route = (await this.sech.route(
        workspaceId,
        REQUESTER,
        {
          checkType: 'pre_execution',
          decisionContext: `Discount ${txn.discountPercent}% on transaction ${txn.transactionId}`,
          domains: ['commercial'],
          signals: { discountGate: true },
          playbooks: ['commercial_growth'],
        },
        ctx,
      )) as { status: string; id: string; counterProposal: string | null };
      dg04 = {
        status: route.status,
        sechRouteId: route.id,
        counterProposal: route.counterProposal ?? null,
      };
    }

    if (txn.isRefund) signals.refundEvent = true;

    const result = await this.connectors.ingest(
      {
        workspaceId,
        connector: 'pos',
        provider,
        eventType: 'incoming_webhook',
        externalId: txn.transactionId,
        requesterId: REQUESTER,
        perception: {
          sourceId: txn.transactionId,
          domain: POS_DOMAIN,
          tier: POS_TIER,
          subject: txn.transactionId,
          summary: `${txn.isRefund ? 'refund' : 'payment'} ${txn.amount} ${txn.currency}`,
          signals,
          payload: {
            ...(payload as JsonRecord),
            parsed: {
              transactionId: txn.transactionId,
              amount: txn.amount,
              currency: txn.currency,
              discountPercent: txn.discountPercent,
              isRefund: txn.isRefund,
            },
          },
        },
      },
      ctx,
    );

    return { ...result, dg04 };
  }
}
