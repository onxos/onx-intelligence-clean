import { Injectable } from '@nestjs/common';
import { ConnectorsService } from '../connectors.service';
import { WHATSAPP_PROVIDER } from './whatsapp.constants';
import {
  BOOKING_KEYWORDS,
  CLINICAL_KEYWORDS,
  COMPLAINT_KEYWORDS,
  EMERGENCY_KEYWORDS,
  WHATSAPP_STATUS_EVENTS,
} from './whatsapp.constants';
import type { MessageClassification } from '../connectors.types';
import type { TwilioWebhookPayload } from './whatsapp.types';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const REQUESTER = 'system-whatsapp';

@Injectable()
export class WhatsAppService {
  constructor(private readonly connectors: ConnectorsService) {}

  /** Keyword classification of an inbound message body. */
  classifyMessage(body: string): MessageClassification {
    const text = (body ?? '').toLowerCase();
    const has = (kw: string[]) => kw.some((k) => text.includes(k));

    if (has(CLINICAL_KEYWORDS)) {
      return {
        domain: 'clinical',
        intent: 'clinical',
        signals: has(EMERGENCY_KEYWORDS) ? { emergencyMedical: true } : {},
      };
    }
    if (has(BOOKING_KEYWORDS)) {
      return { domain: 'operational', intent: 'booking', signals: {} };
    }
    if (has(COMPLAINT_KEYWORDS)) {
      return { domain: 'customer', intent: 'complaint', signals: {} };
    }
    return { domain: 'customer', intent: 'general', signals: {} };
  }

  /** Process an inbound Twilio webhook: classify → USFIP bus (tier 2). */
  async processWebhook(
    workspaceId: string,
    payload: TwilioWebhookPayload,
    ctx?: MutationAuditContext,
  ) {
    const status = (payload.MessageStatus ?? payload.SmsStatus ?? '').toLowerCase();
    const isStatusUpdate = !payload.Body && WHATSAPP_STATUS_EVENTS.includes(status);
    const externalId = payload.MessageSid ?? payload.SmsSid ?? undefined;

    // Delivery status callbacks carry no perception content — record + filter.
    if (isStatusUpdate) {
      return this.connectors.ingest(
        {
          workspaceId,
          connector: 'whatsapp',
          provider: WHATSAPP_PROVIDER,
          eventType: 'incoming_webhook',
          externalId,
          requesterId: REQUESTER,
          filteredReason: `status_update:${status}`,
          perception: { payload: payload as Record<string, unknown> },
        },
        ctx,
      );
    }

    const classification = this.classifyMessage(payload.Body ?? '');
    return this.connectors.ingest(
      {
        workspaceId,
        connector: 'whatsapp',
        provider: WHATSAPP_PROVIDER,
        eventType: 'incoming_webhook',
        externalId,
        requesterId: REQUESTER,
        perception: {
          sourceId: payload.From,
          domain: classification.domain,
          subject: payload.From,
          summary: payload.Body,
          signals: classification.signals,
          payload: {
            ...payload,
            intent: classification.intent,
            profileName: payload.ProfileName,
          } as Record<string, unknown>,
        },
      },
      ctx,
    );
  }
}
