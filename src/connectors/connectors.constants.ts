/**
 * Phase 3 — Connectors: shared vocabulary.
 *
 * Every connector routes external data through the USFIP Perception Bus
 * (HC-12) and is evidence-tiered per AC-05. The Perception Bus only accepts a
 * fixed set of source types (whatsapp/emr/crm/pos/sensor/manual) — the calendar
 * connector therefore maps onto the bus `manual` source type while retaining
 * its own connector identity in the ConnectorLog.
 */

export const CONNECTOR_TYPES = ['whatsapp', 'emr', 'pos', 'calendar'] as const;
export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

export const CONNECTOR_PROVIDERS: Record<ConnectorType, readonly string[]> = {
  whatsapp: ['twilio'],
  emr: ['vettriage', 'kantime', 'fhir'],
  pos: ['square', 'stripe'],
  calendar: ['google', 'outlook'],
};

/** Bus (UsfipPerceptionRecord) source type each connector maps onto. */
export const CONNECTOR_SOURCE_TYPE: Record<ConnectorType, string> = {
  whatsapp: 'whatsapp',
  emr: 'emr',
  pos: 'pos',
  calendar: 'manual',
};

/** Default classified domain per connector. */
export const CONNECTOR_DOMAIN: Record<ConnectorType, string> = {
  whatsapp: 'customer',
  emr: 'clinical',
  pos: 'commercial',
  calendar: 'operational',
};

/** AC-05 evidence tier per connector (1 = highest, first-party operational data). */
export const CONNECTOR_TIER: Record<ConnectorType, number> = {
  whatsapp: 2,
  emr: 1,
  pos: 1,
  calendar: 2,
};

export const CONNECTOR_EVENT_TYPES = ['incoming_webhook', 'api_fetch', 'sync'] as const;
export type ConnectorEventType = (typeof CONNECTOR_EVENT_TYPES)[number];

export const LOG_STATUS = {
  PENDING: 'pending',
  PROCESSED: 'processed',
  FAILED: 'failed',
  FILTERED: 'filtered',
} as const;

/** DG-04 discount gate threshold (percent). */
export const DG04_DISCOUNT_THRESHOLD = 30;
/** SC-09 minimum schedule-change notice (hours). */
export const SC09_NOTICE_HOURS = 48;

export function isConnector(value: string): value is ConnectorType {
  return (CONNECTOR_TYPES as readonly string[]).includes(value);
}

export function providerAllowed(connector: ConnectorType, provider: string): boolean {
  return CONNECTOR_PROVIDERS[connector].includes(provider.toLowerCase());
}
