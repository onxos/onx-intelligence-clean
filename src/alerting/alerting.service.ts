import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../common/structured-logger.service';
import { metrics } from '../monitoring/metrics.registry';
import { ALERT_CHANNEL_ENV, AlertChannel, AlertPayload } from './alerting.constants';

export interface DispatchResult {
  channel: AlertChannel;
  dispatched: boolean;
  reason?: string;
}

/**
 * Phase 4 — alerting for critical constitutional + operational events. When a
 * channel webhook is configured (env var) the alert is POSTed; otherwise it is
 * recorded via the structured logger (never a hard failure). Every alert
 * increments the alerts_total metric.
 */
@Injectable()
export class AlertingService {
  async dispatch(channel: AlertChannel, payload: AlertPayload): Promise<DispatchResult> {
    metrics.alertsTotal.inc({ channel, severity: payload.severity });
    const url = process.env[ALERT_CHANNEL_ENV[channel]];

    if (!url) {
      StructuredLogger.warn(`alert (${channel}) not dispatched — channel unconfigured`, {
        alert: payload.title,
        severity: payload.severity,
        fields: payload.fields,
      });
      return { channel, dispatched: false, reason: 'channel_unconfigured' };
    }

    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: payload.title,
          severity: payload.severity,
          fields: payload.fields,
        }),
      });
      StructuredLogger.info(`alert dispatched (${channel})`, { alert: payload.title });
      return { channel, dispatched: true };
    } catch (err) {
      StructuredLogger.error(`alert dispatch failed (${channel})`, {
        alert: payload.title,
        error: (err as Error)?.message,
      });
      return { channel, dispatched: false, reason: 'dispatch_error' };
    }
  }

  onViolation(violation: {
    constraintId: string;
    action?: string;
    workspaceId?: string;
    severity?: string;
    timestamp?: string;
  }): Promise<DispatchResult> {
    const critical = (violation.severity ?? 'CRITICAL').toUpperCase() === 'CRITICAL';
    return this.dispatch(AlertChannel.SLACK, {
      title: `🚨 Constitutional violation: ${violation.constraintId}`,
      severity: critical ? 'critical' : 'warning',
      fields: {
        constraint: violation.constraintId,
        action: violation.action ?? 'unknown',
        workspace: violation.workspaceId ?? 'unknown',
        time: violation.timestamp ?? new Date().toISOString(),
      },
    });
  }

  onProviderDown(provider: string): Promise<DispatchResult> {
    return this.dispatch(AlertChannel.SLACK, {
      title: `⚠️ AI provider down: ${provider}`,
      severity: 'warning',
      fields: { provider },
    });
  }

  onSechConflict(conflict: {
    conflictClass: string;
    workspaceId?: string;
  }): Promise<DispatchResult> {
    return this.dispatch(AlertChannel.PAGERDUTY, {
      title: `SECH conflict: ${conflict.conflictClass}`,
      severity: 'warning',
      fields: {
        conflictClass: conflict.conflictClass,
        workspace: conflict.workspaceId ?? 'unknown',
      },
    });
  }
}
