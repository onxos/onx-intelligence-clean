import type { ConnectorEventType, ConnectorType } from './connectors.constants';

export type JsonRecord = Record<string, unknown>;

/** Normalized perception ready for the USFIP bus. */
export interface NormalizedPerception {
  sourceId?: string;
  domain?: string;
  tier?: number;
  subject?: string;
  summary?: string;
  signals?: Record<string, boolean | number>;
  playbooks?: string[];
  payload: JsonRecord;
}

/** Everything the orchestrator needs to log + ingest a single event. */
export interface ConnectorIngestInput {
  workspaceId: string;
  connector: ConnectorType;
  provider: string;
  eventType: ConnectorEventType;
  externalId?: string;
  requesterId: string;
  perception: NormalizedPerception;
  /** When set, the event is logged as `filtered` and never reaches the bus. */
  filteredReason?: string;
}

export interface ConnectorIngestResult {
  logId: string;
  status: string;
  usfipRecordId: string | null;
  perceptionStatus?: string;
}

export interface ParsedPatient {
  externalId: string;
  name: string;
  species?: string;
  diagnosisCode?: string;
  treatmentDate?: string;
  veterinarianId?: string;
  raw: JsonRecord;
}

export interface ParsedTransaction {
  transactionId: string;
  amount: number;
  currency: string;
  discountPercent: number;
  isRefund: boolean;
  account?: string;
  raw: JsonRecord;
}

export interface ParsedCalendarEvent {
  externalId: string;
  title: string;
  start?: string;
  isModified: boolean;
  hoursUntil: number;
  raw: JsonRecord;
}

export interface MessageClassification {
  domain: string;
  intent: 'booking' | 'clinical' | 'complaint' | 'general';
  signals: Record<string, boolean | number>;
}
