// ============================================================
// STRUCTURED LOGGER (L-17)
// ============================================================
// Replaces ad-hoc console.log calls with a single structured JSON
// logger. Each line is a self-describing JSON object (level, msg, ts,
// service, plus arbitrary fields) so logs are machine-parseable by the
// deployment's log pipeline instead of free-form text.
//
// Writes go to stdout for info/debug and stderr for warn/error, which
// keeps error streams separable in hosted environments (Render, etc.).
// ============================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

const SERVICE = "onx-intelligence";

export interface LogFields {
  [key: string]: unknown;
}

function emit(level: LogLevel, msg: string, fields?: LogFields): void {
  const record = {
    level,
    msg,
    ts: new Date().toISOString(),
    service: SERVICE,
    env: process.env.NODE_ENV ?? "development",
    ...(fields ?? {}),
  };
  let line: string;
  try {
    line = JSON.stringify(record);
  } catch {
    // Never let a serialization failure crash the caller.
    line = JSON.stringify({ level, msg, ts: record.ts, service: SERVICE });
  }
  if (level === "warn" || level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
};

/** Exposed for unit testing / custom sinks. */
export const StructuredLogger = { emit, logger };
