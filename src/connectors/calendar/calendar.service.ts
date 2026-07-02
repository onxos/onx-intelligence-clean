import { Injectable } from '@nestjs/common';
import { ConnectorsService } from '../connectors.service';
import {
  CALENDAR_DOMAIN,
  CALENDAR_SC09_HOURS,
  CALENDAR_TIER,
  calendarMockEvents,
} from './calendar.constants';
import type { JsonRecord, ParsedCalendarEvent } from '../connectors.types';
import type { SyncConnectorDto } from '../dto/connector.dto';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const REQUESTER = 'system-calendar';

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Normalize a raw Google/Outlook event. */
export function parseCalendarEvent(raw: JsonRecord): ParsedCalendarEvent {
  const startObj = raw.start as JsonRecord | string | undefined;
  const start =
    typeof startObj === 'string'
      ? startObj
      : (str((startObj as JsonRecord)?.dateTime) ?? str((startObj as JsonRecord)?.date));
  const status = (str(raw.status) ?? '').toLowerCase();
  const isModified = status === 'modified' || Boolean(raw.isModified);
  const hoursUntil = start
    ? (new Date(start).getTime() - Date.now()) / 3600_000
    : Number.POSITIVE_INFINITY;
  return {
    externalId: str(raw.id) ?? 'unknown',
    title: str(raw.title) ?? str(raw.summary) ?? 'Untitled',
    start,
    isModified,
    hoursUntil: Number.isFinite(hoursUntil) ? Math.round(hoursUntil * 10) / 10 : 9999,
    raw,
  };
}

@Injectable()
export class CalendarService {
  constructor(private readonly connectors: ConnectorsService) {}

  /**
   * Pull calendar events into the USFIP bus at tier 2 (operational). A modified
   * event inside the SC-09 notice window (48h) is flagged with a
   * `scheduleChangeShortNotice` signal so the bus FIC check can act on it.
   *
   * TODO(calendar): replace mock events with an OAuth2 Google Calendar /
   * Microsoft Graph fetch using the stored connector credentials.
   */
  async sync(workspaceId: string, dto: SyncConnectorDto, ctx?: MutationAuditContext) {
    const provider = (dto.provider ?? 'google').toLowerCase();
    const raw = dto.records?.length ? dto.records : calendarMockEvents();

    const results = [];
    for (const item of raw) {
      const event = parseCalendarEvent(item as JsonRecord);
      const shortNotice = event.isModified && event.hoursUntil < CALENDAR_SC09_HOURS;
      const signals: Record<string, boolean | number> = {};
      if (shortNotice) signals.scheduleChangeShortNotice = true;

      const result = await this.connectors.ingest(
        {
          workspaceId,
          connector: 'calendar',
          provider,
          eventType: 'sync',
          externalId: event.externalId,
          requesterId: REQUESTER,
          perception: {
            sourceId: event.externalId,
            domain: CALENDAR_DOMAIN,
            tier: CALENDAR_TIER,
            subject: event.title,
            summary: `${event.title}${shortNotice ? ' (SC-09 short-notice change)' : ''}`,
            signals,
            payload: {
              ...event.raw,
              parsed: {
                externalId: event.externalId,
                title: event.title,
                start: event.start,
                isModified: event.isModified,
                hoursUntil: event.hoursUntil,
                sc09ShortNotice: shortNotice,
              },
            } as JsonRecord,
          },
        },
        ctx,
      );
      results.push({ externalId: event.externalId, sc09ShortNotice: shortNotice, ...result });
    }

    await this.connectors.markSync(workspaceId, 'calendar', provider);
    return { connector: 'calendar', provider, ingested: results.length, results };
  }
}
