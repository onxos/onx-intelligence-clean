/**
 * IW-32 D18 — Exception Handling constants: the 5 override-rule handlers.
 */

export interface OverrideHandlerDef {
  rule: string;
  handlerType: string;
  condition: string;
  /** Override lifetime in ms (null = no automatic expiry). */
  expiryMs: number | null;
  notifyFounder: boolean;
}

const HOUR = 60 * 60 * 1000;

export const OVERRIDE_HANDLERS: readonly OverrideHandlerDef[] = [
  {
    rule: 'OR-01',
    handlerType: 'EmergencyMedicalHandler',
    condition: 'Animal welfare at immediate risk',
    expiryMs: 1 * HOUR, // OR-01: Founder notification within 1 hour
    notifyFounder: true,
  },
  {
    rule: 'OR-02',
    handlerType: 'FounderSelfOverrideHandler',
    condition: 'Founder overrides their own prior intent',
    expiryMs: 30 * 24 * HOUR, // 30-day trial
    notifyFounder: false,
  },
  {
    rule: 'OR-03',
    handlerType: 'ConstitutionalAmendmentHandler',
    condition: 'Founding team unanimously amends a Hard Constraint',
    expiryMs: null, // permanent pending DG-06 review
    notifyFounder: true,
  },
  {
    rule: 'OR-04',
    handlerType: 'LegalComplianceHandler',
    condition: 'Legal/regulatory requirement conflicts with intent',
    expiryMs: null,
    notifyFounder: true,
  },
  {
    rule: 'OR-05',
    handlerType: 'CatastrophicEventHandler',
    condition: 'Single event with irreversible institutional impact',
    expiryMs: 24 * HOUR, // 24-hour human review window
    notifyFounder: true,
  },
];

export const HANDLERS_BY_RULE: ReadonlyMap<string, OverrideHandlerDef> = new Map(
  OVERRIDE_HANDLERS.map((h) => [h.rule, h]),
);

export function resolveHandler(rule: string): OverrideHandlerDef | undefined {
  return HANDLERS_BY_RULE.get(rule.trim().toUpperCase());
}
