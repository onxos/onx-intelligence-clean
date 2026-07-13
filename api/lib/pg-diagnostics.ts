// ============================================================
// PG DIAGNOSTICS — Wave K2 "Postgres adapter silent-failure diagnostics"
//
// A single, shared toolkit that turns silent Postgres failures into
// LOUD, observable signals. Historically the persistence adapters
// swallowed pg errors (bare `catch {}`, fire-and-forget writes, a lone
// numeric counter, unstructured `console.error`), so data-loss and
// partial-failure conditions went undetected.
//
// This module provides:
//   • recordPgFailure / recordPgSuccess — structured single-line JSON
//     logging (op + truncated error message + correlation id + counters);
//     NEVER logs row data, payloads, or secrets.
//   • getPgDiagnostics / resetPgDiagnostics — numbers + last-error only,
//     safe to surface through /health.
//   • withPgTransaction — BEGIN → fn → COMMIT, ROLLBACK + propagate on
//     failure (FAIL-CLOSED): the sanctioned pattern for a write that MUST
//     be all-or-nothing.
//   • assertAffected — turns an unchecked rowCount into a fail-closed
//     PgWriteError when an expected write touched 0 rows.
//   • newCorrelationId — a trace id to correlate a failure across logs.
//
// Fail-open vs fail-closed: the persistence stores keep a deliberate,
// documented in-memory mirror so a dead database can never crash cron /
// boot (PR #18 lesson). This module does NOT change that availability
// guarantee — it makes the swallow observable. Callers that need a write
// to be durable use withPgTransaction / assertAffected to fail closed.
// ============================================================
import { randomUUID } from "node:crypto";

const MAX_MESSAGE_LENGTH = 300;

/** Consecutive failures for a single op before it is reported as degraded. */
export const DEGRADED_THRESHOLD = 3;

/** Typed error for a Postgres write that must not be silently swallowed. */
export class PgWriteError extends Error {
  readonly op: string;
  readonly code: string;
  readonly cause?: unknown;
  constructor(op: string, message: string, opts: { code?: string; cause?: unknown } = {}) {
    super(message);
    this.name = "PgWriteError";
    this.op = op;
    this.code = opts.code ?? "PG_WRITE_FAILED";
    this.cause = opts.cause;
  }
}

export interface PgLastError {
  op: string;
  code: string;
  message: string;
  correlationId: string | null;
  at: string;
}

export interface PgDiagnostics {
  /** Total pg failures recorded across all operations. */
  pgErrors: number;
  /** Total pg successes recorded across all operations. */
  pgSuccesses: number;
  /** Per-operation failure counts. */
  pgErrorsByOp: Record<string, number>;
  /** Operations currently over the consecutive-failure threshold. */
  degradedOps: string[];
  /** True when any operation is degraded. */
  degraded: boolean;
  /** The most recent failure (numbers + truncated message only). */
  lastError: PgLastError | null;
}

interface DiagnosticsState {
  pgErrors: number;
  pgSuccesses: number;
  errorsByOp: Map<string, number>;
  consecutiveByOp: Map<string, number>;
  lastError: PgLastError | null;
}

const state: DiagnosticsState = {
  pgErrors: 0,
  pgSuccesses: 0,
  errorsByOp: new Map(),
  consecutiveByOp: new Map(),
  lastError: null,
};

/** A short trace id to correlate a failure across log lines. */
export function newCorrelationId(): string {
  return randomUUID();
}

function truncate(message: string): string {
  return message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message;
}

/** Best-effort extraction of a pg/driver error code without leaking data. */
function errorCode(error: unknown): string {
  if (error instanceof PgWriteError) return error.code;
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return "PG_ERROR";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export interface RecordFailureContext {
  correlationId?: string | null;
}

/**
 * Record a Postgres operation failure: increments counters, tracks the
 * consecutive-failure streak (for the degraded signal), stores a
 * sanitized last-error, and emits a structured single-line JSON log.
 * Returns the correlation id used, so the caller can thread it further.
 */
export function recordPgFailure(op: string, error: unknown, ctx: RecordFailureContext = {}): string {
  const correlationId = ctx.correlationId ?? newCorrelationId();
  const code = errorCode(error);
  const message = truncate(errorMessage(error));

  state.pgErrors += 1;
  state.errorsByOp.set(op, (state.errorsByOp.get(op) ?? 0) + 1);
  state.consecutiveByOp.set(op, (state.consecutiveByOp.get(op) ?? 0) + 1);
  state.lastError = { op, code, message, correlationId, at: new Date().toISOString() };

  // Structured, machine-parseable, secret-free. Never includes row data.
  console.error(
    JSON.stringify({
      level: "error",
      event: "pg_failure",
      op,
      code,
      message,
      correlationId,
      consecutiveFailures: state.consecutiveByOp.get(op) ?? 1,
      ts: state.lastError.at,
    }),
  );

  return correlationId;
}

/** Record a Postgres operation success: clears that op's failure streak. */
export function recordPgSuccess(op: string): void {
  state.pgSuccesses += 1;
  state.consecutiveByOp.set(op, 0);
}

function degradedOps(): string[] {
  const ops: string[] = [];
  for (const [op, streak] of state.consecutiveByOp) {
    if (streak >= DEGRADED_THRESHOLD) ops.push(op);
  }
  return ops.sort();
}

/** Numbers + last-error only — safe to expose through /health. */
export function getPgDiagnostics(): PgDiagnostics {
  const ops = degradedOps();
  return {
    pgErrors: state.pgErrors,
    pgSuccesses: state.pgSuccesses,
    pgErrorsByOp: Object.fromEntries(state.errorsByOp),
    degradedOps: ops,
    degraded: ops.length > 0,
    lastError: state.lastError ? { ...state.lastError } : null,
  };
}

/** Test-only: reset all diagnostics state. */
export function resetPgDiagnostics(): void {
  state.pgErrors = 0;
  state.pgSuccesses = 0;
  state.errorsByOp.clear();
  state.consecutiveByOp.clear();
  state.lastError = null;
}

/**
 * Fail-closed guard for an unchecked write result: throws a PgWriteError
 * when an operation that was expected to change rows affected none.
 */
export function assertAffected(rowCount: number | null | undefined, op: string): void {
  if (!rowCount || rowCount < 1) {
    throw new PgWriteError(op, `${op} affected 0 rows (expected at least 1)`, {
      code: "PG_NO_ROWS_AFFECTED",
    });
  }
}

/** Minimal client seam so withPgTransaction is testable against a mock. */
export interface PgTxClient {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
}

export interface TransactionOptions {
  op: string;
  correlationId?: string | null;
}

/**
 * Run `fn` inside a single BEGIN/COMMIT transaction. On ANY failure the
 * transaction is rolled back, the failure is recorded (loud), and the
 * error propagates FAIL-CLOSED — the caller decides whether to absorb it
 * (availability) or surface it. This is the sanctioned pattern for a
 * multi-statement write that must be all-or-nothing (no partial-write
 * divergence).
 */
export async function withPgTransaction<T>(
  client: PgTxClient,
  fn: (client: PgTxClient) => Promise<T>,
  options: TransactionOptions,
): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await fn(client);
    await client.query("COMMIT");
    recordPgSuccess(options.op);
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      // A failed rollback is itself a loud, separate signal.
      recordPgFailure(`${options.op}.rollback`, rollbackError, {
        correlationId: options.correlationId,
      });
    }
    recordPgFailure(options.op, error, { correlationId: options.correlationId });
    throw error instanceof PgWriteError
      ? error
      : new PgWriteError(options.op, errorMessage(error), {
          code: errorCode(error),
          cause: error,
        });
  }
}
