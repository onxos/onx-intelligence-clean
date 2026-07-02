/** Phase 4 — background queue names. */
export const QUEUES = {
  ficEnforcement: 'fic-enforcement',
  iurgBinding: 'iurg-binding',
  connectorSync: 'connector-sync',
  aiConsensus: 'ai-consensus',
  auditLog: 'audit-log',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const QUEUE_NAMES: QueueName[] = Object.values(QUEUES);
