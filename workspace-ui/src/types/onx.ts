/**
 * Phase 2 — shared dashboard types. These mirror the NestJS backend contracts
 * (ai-core, sech, iurg, assessment). Kept intentionally loose where the backend
 * returns rich/variable shapes.
 */

export type EvidenceTier = "proven" | "probable" | "speculative" | "unverified";

export interface AiProviderInfo {
  name: string;
  model: string;
  priority: number;
  evidenceTier: string;
  configured: boolean;
  mode: "live" | "mock";
}

export interface AiProviderStatus extends AiProviderInfo {
  available: boolean;
}

export interface AiQueryResult {
  status: "approved" | "rejected" | "flagged";
  queryId: string;
  response?: string | null;
  provider?: string;
  model?: string;
  evidenceTier?: string;
  tokensUsed?: number;
  latencyMs?: number;
  mock?: boolean;
  counterProposal?: string | null;
  requiresHumanApproval?: boolean;
  ficStatus?: string;
  ficCheckId?: string | null;
  sechRouteId?: string | null;
  iurgNodeId?: string | null;
}

export interface AiConsensusResult {
  agreed: boolean;
  agreementCount: number;
  totalConsulted: number;
  consensusContent: string | null;
  evidenceTier: string;
  responses: Array<{ provider: string; model: string; content: string; mock: boolean }>;
}

export interface AiConsensusResponse extends AiQueryResult {
  consensus: AiConsensusResult | null;
}

export interface AiQueryLog {
  queryId: string;
  query: string;
  domain: string;
  providerUsed: string;
  modelUsed: string;
  response: string | null;
  tokensUsed: number;
  latencyMs: number;
  evidenceTier: string;
  ficStatus: string;
  createdAt: string;
}

export interface Paginated<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface SechGateDef {
  gate: string;
  checkType: string;
  phase: string;
  lastRoute?: { status: string; createdAt: string } | null;
}

export interface FicConstraint {
  id: string;
  kind: string;
  title?: string;
  description?: string;
  severity?: string;
}

export interface IurgViolation {
  id: string;
  iurgId?: string;
  constraintRef?: string;
  reason?: string;
  createdAt?: string;
}

export interface Patient {
  id: string;
  patientId?: string;
  name: string;
  species: string;
  breed: string;
  ageYears: number;
  weightKg: number;
  status: "stable" | "monitoring" | "critical";
  presenting: string[];
}

export interface ClinicalAppointmentItem {
  patientId: string;
  name: string;
  status: "stable" | "monitoring" | "critical";
  recommendedWindow: string;
  priority: number;
  reason: string;
}

export interface ClinicalAppointmentSchedule {
  schedule: ClinicalAppointmentItem[];
  waitlist: Array<{ id: string; patientId: string; priority: number; reason?: string }>;
}

export interface SoapNoteRecord {
  id: string;
  patientId: string | null;
  template: "SOAP";
  createdAt: string;
  note: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  tags: string[];
  transcriptSummary: string | null;
}

export interface VitalsTrendRow {
  kind: string;
  count: number;
  average: number;
  latest: number;
  change: number;
  anomaly: boolean;
}

export interface VitalsTrendResult {
  workspaceId: string;
  patientId: string;
  trends: VitalsTrendRow[];
  alerts: string[];
}
