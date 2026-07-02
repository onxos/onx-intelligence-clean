/**
 * Phase 4 — dependency-free Prometheus metrics registry.
 *
 * Implements just enough of the Prometheus text exposition format (counters and
 * a count/sum histogram) to expose ONX metrics at /metrics without pulling in
 * prom-client. Label sets are serialized deterministically.
 */

function labelKey(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${labels[k]}`).join(',');
}

function renderLabels(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return '';
  return `{${keys.map((k) => `${k}="${escapeLabel(labels[k])}"`).join(',')}}`;
}

function escapeLabel(value: string): string {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export class Counter {
  private readonly series = new Map<string, { labels: Record<string, string>; value: number }>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: string[] = [],
  ) {}

  inc(labels: Record<string, string> = {}, value = 1): void {
    const key = labelKey(labels);
    const existing = this.series.get(key);
    if (existing) existing.value += value;
    else this.series.set(key, { labels, value });
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    if (this.series.size === 0) {
      lines.push(`${this.name} 0`);
    }
    for (const s of this.series.values()) {
      lines.push(`${this.name}${renderLabels(s.labels)} ${s.value}`);
    }
    return lines.join('\n');
  }
}

export class Histogram {
  private readonly series = new Map<
    string,
    { labels: Record<string, string>; count: number; sum: number }
  >();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: string[] = [],
  ) {}

  observe(labels: Record<string, string> = {}, value = 0): void {
    const key = labelKey(labels);
    const existing = this.series.get(key);
    if (existing) {
      existing.count += 1;
      existing.sum += value;
    } else {
      this.series.set(key, { labels, count: 1, sum: value });
    }
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} summary`];
    for (const s of this.series.values()) {
      lines.push(`${this.name}_count${renderLabels(s.labels)} ${s.count}`);
      lines.push(`${this.name}_sum${renderLabels(s.labels)} ${s.sum}`);
    }
    return lines.join('\n');
  }
}

/** Central ONX metric registry (10+ series). */
export const metrics = {
  httpRequestsTotal: new Counter('http_requests_total', 'Total HTTP requests', [
    'method',
    'route',
    'status',
  ]),
  httpRequestDuration: new Histogram('http_request_duration_seconds', 'HTTP request duration', [
    'method',
    'route',
  ]),
  ficChecksTotal: new Counter('fic_checks_total', 'FIC checks executed', ['result', 'gate']),
  violationsTotal: new Counter('violations_total', 'Constitutional violations', [
    'constraint_family',
  ]),
  aiQueriesTotal: new Counter('ai_queries_total', 'AI queries', ['provider', 'domain']),
  aiLatency: new Histogram('ai_latency_seconds', 'AI provider latency', ['provider']),
  connectorEventsTotal: new Counter('connector_events_total', 'Connector ingestion events', [
    'connector',
    'status',
  ]),
  queueJobsTotal: new Counter('queue_jobs_total', 'Queue jobs processed', ['queue', 'status']),
  patientsSeenTotal: new Counter('patients_seen_total', 'Patients seen', ['workspace']),
  revenueTrackedTotal: new Counter('revenue_tracked_total', 'Revenue tracked', ['workspace']),
  alertsTotal: new Counter('alerts_total', 'Alerts dispatched', ['channel', 'severity']),
};

export type MetricsRegistry = typeof metrics;

export function renderMetrics(): string {
  return (
    Object.values(metrics)
      .map((m) => m.render())
      .join('\n\n') + '\n'
  );
}
