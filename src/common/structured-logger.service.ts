export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogMeta {
  traceId?: string;
  workspaceId?: string;
  userId?: string;
  [key: string]: unknown;
}

/**
 * Phase 4 — structured JSON logger (dependency-free Winston equivalent). Emits
 * one JSON object per line with a stable envelope so logs are queryable in
 * CloudWatch/Splunk. Additive: it does not replace the Nest global logger.
 */
export class StructuredLogger {
  static readonly service = 'onx-intelligence';

  static log(level: LogLevel, message: string, meta: LogMeta = {}): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: StructuredLogger.service,
      ...meta,
    };
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }

  static info(message: string, meta?: LogMeta): void {
    StructuredLogger.log('info', message, meta);
  }
  static warn(message: string, meta?: LogMeta): void {
    StructuredLogger.log('warn', message, meta);
  }
  static error(message: string, meta?: LogMeta): void {
    StructuredLogger.log('error', message, meta);
  }
}
