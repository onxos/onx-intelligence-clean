export enum AlertChannel {
  SLACK = 'slack',
  PAGERDUTY = 'pagerduty',
  EMAIL = 'email',
}

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertPayload {
  title: string;
  severity: AlertSeverity;
  fields?: Record<string, string>;
}

/** Env var holding the webhook/routing key for each channel. */
export const ALERT_CHANNEL_ENV: Record<AlertChannel, string> = {
  [AlertChannel.SLACK]: 'SLACK_WEBHOOK_URL',
  [AlertChannel.PAGERDUTY]: 'PAGERDUTY_WEBHOOK_URL',
  [AlertChannel.EMAIL]: 'ALERT_EMAIL_WEBHOOK_URL',
};
