// Core Types for ONX Intelligence Runtime

export interface IntelligenceObject {
  id: string;
  content: string;
  objectType: string;
  originSource: string;
  amanahScore: string;
  confidence: string;
  lifecycleState: string;
  shadowStatus: string | null;
  understandingRung: number;
  workspaceId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanionSession {
  id: string;
  companionType: CompanionType;
  userId: string;
  institutionId: string;
  startedAt: Date;
  lastActive: Date;
  flourishingScore: number;
  interactions: InteractionRecord[];
}

export enum CompanionType {
  FOUNDER = 'FOUNDER',
  ANALYST = 'ANALYST',
  CLINIC = 'CLINIC',
  PERSONAL = 'PERSONAL',
  CAREGIVER = 'CAREGIVER',
}

export interface InteractionRecord {
  query: string;
  response: string;
  timestamp: Date;
  flourishingImpact: number;
  humanApprovalRequired: boolean;
}

export interface GuardianDecision {
  allowed: boolean;
  reason: string;
  score: number;
  principlesUpheld: string[];
  principlesViolated: string[];
}

export interface ProvenanceRecord {
  id: string;
  objectId: number;
  dimension: string;
  value: string;
  hash: string;
  createdAt: Date;
}

export interface CapitalRecord {
  id: string;
  objectId: number;
  category: string;
  amount: string;
  operation: string;
  balance: string;
  reason: string;
  createdAt: Date;
}

export interface Measurement {
  id: string;
  measurementType: string;
  value: string;
  windowType: string;
  details: string | null;
  measuredAt: Date;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  autoCreatedBy: string | null;
  createdAt: Date;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  amanahScore: number;
  citations: string[];
  createdAt: Date;
}

export interface TitanPersona {
  id: string;
  name: string;
  domain: string;
  systemPrompt: string;
  capabilities: string[];
  model: string;
  temperature: number;
}

export interface ModelProvider {
  id: string;
  name: string;
  apiKey: string;
  endpoint: string;
  health: boolean;
  latency: number;
  successRate: number;
}

export interface ConsciousnessCycle {
  name: string;
  interval: number;
  lastRun: Date;
  status: 'active' | 'paused' | 'error';
  handler: () => Promise<void>;
}

export interface InstitutionalState {
  institutionId: string;
  institutionName: string;
  dreams: Dream[];
  potentials: Potential[];
  goals: Goal[];
  understandings: Understanding[];
  executions: Execution[];
  flourishing: FlourishingMetrics;
  evolutions: Evolution[];
  cycleCompleteness: number;
  cycleIntegrity: boolean;
}

export interface Dream { id: string; title: string; status: string; }
export interface Potential { id: string; name: string; type: string; }
export interface Goal { id: string; title: string; status: string; }
export interface Understanding { id: string; content: string; level: string; }
export interface Execution { id: string; type: string; status: string; }
export interface FlourishingMetrics { composite: number; trust: number; resilience: number; }
export interface Evolution { id: string; type: string; timestamp: Date; }

export interface ISESScore {
  domainFitness: number;
  riskFitness: number;
  historicalPerformance: number;
  evidenceQuality: number;
  judgmentQuality: number;
  hallucinationResistance: number;
  governanceCompliance: number;
  costEfficiency: number;
  latency: number;
  reliability: number;
  outcomeSuccess: number;
  ownershipCompatibility: number;
}

export interface SilRegistry {
  domains: string[];
  registerDomain(domain: string): void;
  getDomains(): string[];
}
