import { Counter, Histogram, metrics, renderMetrics } from './metrics.registry';

describe('metrics registry', () => {
  it('counter increments and renders with labels', () => {
    const c = new Counter('demo_total', 'demo', ['a']);
    c.inc({ a: 'x' });
    c.inc({ a: 'x' }, 2);
    c.inc({ a: 'y' });
    const out = c.render();
    expect(out).toContain('# TYPE demo_total counter');
    expect(out).toContain('demo_total{a="x"} 3');
    expect(out).toContain('demo_total{a="y"} 1');
  });

  it('counter renders zero when empty', () => {
    const c = new Counter('empty_total', 'empty');
    expect(c.render()).toContain('empty_total 0');
  });

  it('histogram records count and sum', () => {
    const h = new Histogram('lat_seconds', 'latency', ['p']);
    h.observe({ p: 'openai' }, 0.5);
    h.observe({ p: 'openai' }, 1.5);
    const out = h.render();
    expect(out).toContain('lat_seconds_count{p="openai"} 2');
    expect(out).toContain('lat_seconds_sum{p="openai"} 2');
  });

  it('escapes label values', () => {
    const c = new Counter('esc_total', 'esc', ['route']);
    c.inc({ route: 'a"b' });
    expect(c.render()).toContain('esc_total{route="a\\"b"} 1');
  });

  it('exposes the ONX metric surface', () => {
    expect(metrics.httpRequestsTotal).toBeInstanceOf(Counter);
    expect(metrics.aiLatency).toBeInstanceOf(Histogram);
    expect(Object.keys(metrics).length).toBeGreaterThanOrEqual(10);
  });

  it('renderMetrics concatenates all series', () => {
    metrics.ficChecksTotal.inc({ result: 'APPROVED', gate: 'pre_execution' });
    const out = renderMetrics();
    expect(out).toContain('fic_checks_total');
    expect(out).toContain('http_requests_total');
    expect(out).toContain('ai_queries_total');
  });
});
