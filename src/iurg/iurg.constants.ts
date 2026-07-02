/**
 * IW-24 — IURG Full Binding constants (CCP v1.0 Section 12).
 *
 * The Intent-Understanding-Reasoning Graph binds every FIC runtime event to a
 * typed node + a complete edge set + an Intent Evolution Ledger entry. This
 * module carries the vocabulary (8 node types, 10 edge types) and derivation
 * helpers used by IurgService. It reuses the FIC constitutional registry
 * (fic-enforcement.constants.ts) by value — no duplication.
 */

import { IurgEdgeType } from '@prisma/client';
import {
  ALL_CONSTRAINTS,
  CONSTRAINTS_BY_ID,
  FOUNDER_INTENT_CORPUS,
} from '../intent-compiler/fic-enforcement.constants';

/** The 8 IURG object (node) types. */
export const IURG_NODE_TYPES = [
  'INTENT',
  'CONSTRAINT',
  'CONFLICT',
  'OVERRIDE',
  'REVIEW',
  'AMENDMENT',
  'ENFORCEMENT',
  'VIOLATION',
] as const;
export type IurgNodeType = (typeof IURG_NODE_TYPES)[number];

/** Non-object node references used as edge endpoints. */
export const IURG_ENDPOINT_TYPES = ['PLAYBOOK', 'EVIDENCE', 'DECISION', 'ACTION'] as const;

/** The 10 IURG edge types (Prisma enum), with canonical lowercase labels. */
export const IURG_EDGE_LABELS: Record<IurgEdgeType, string> = {
  DERIVED_FROM: 'derived_from',
  CONSTRAINS: 'constrains',
  CONFLICTS_WITH: 'conflicts_with',
  SUPERSEDES: 'supersedes',
  ENFORCED_BY: 'enforced_by',
  VIOLATED_BY: 'violated_by',
  REVIEWED_UNDER: 'reviewed_under',
  AMENDED_BY: 'amended_by',
  VALIDATED_BY: 'validated_by',
  REALIZED_AS: 'realized_as',
};

export const IURG_EDGE_TYPES: IurgEdgeType[] = Object.keys(IURG_EDGE_LABELS) as IurgEdgeType[];

/** FIC decision -> IURG object (node) type produced. */
export const DECISION_TO_NODE_TYPE: Record<string, IurgNodeType> = {
  APPROVED: 'ENFORCEMENT',
  REJECTED: 'VIOLATION',
  CONFLICT: 'CONFLICT',
  OVERRIDE: 'OVERRIDE',
};

/** FIC decision -> IURG event_type label. */
export const DECISION_TO_EVENT_TYPE: Record<string, string> = {
  APPROVED: 'enforcement',
  REJECTED: 'violation',
  CONFLICT: 'conflict',
  OVERRIDE: 'override',
};

/**
 * Reverse index: constraint id -> the Founder Intent refs it derives from
 * (from FOUNDER_INTENT_CORPUS.relatedConstraints). Powers `derived_from` edges.
 */
export const CONSTRAINT_SOURCE_INTENTS: ReadonlyMap<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const intent of FOUNDER_INTENT_CORPUS) {
    for (const constraintId of intent.relatedConstraints) {
      const list = map.get(constraintId) ?? [];
      if (!list.includes(intent.intentId)) {
        list.push(intent.intentId);
      }
      map.set(constraintId, list);
    }
  }
  return map;
})();

export function sourceIntentsForConstraint(constraintId: string): string[] {
  return CONSTRAINT_SOURCE_INTENTS.get(constraintId) ?? [];
}

export function constraintKind(constraintId: string): string | undefined {
  return CONSTRAINTS_BY_ID.get(constraintId)?.kind;
}

export function constraintTitle(constraintId: string): string | undefined {
  return CONSTRAINTS_BY_ID.get(constraintId)?.title;
}

export function isKnownConstraint(constraintId: string): boolean {
  return CONSTRAINTS_BY_ID.has(constraintId);
}

/** Total constraints in the registry (for parity checks). */
export const IURG_REGISTRY_CONSTRAINT_COUNT = ALL_CONSTRAINTS.length;

export const IURG_LIST_SORT_FIELDS = ['createdAt'] as const;

export const IURG_QUERY_EVENT_TYPES = [
  'enforcement',
  'violation',
  'conflict',
  'override',
  'review',
  'amendment',
] as const;
export type IurgQueryEventType = (typeof IURG_QUERY_EVENT_TYPES)[number];
