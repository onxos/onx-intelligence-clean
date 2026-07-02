import http from 'k6/http';
import { check, sleep } from 'k6';

// Weighted mixed workload: 40% SECH, 30% AI, 20% connector webhook, 10% health.
// k6 run -e BASE_URL=http://localhost:3000 tests/load/k6-mixed-load.js
const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '3m', target: 1000 },
    { duration: '2m', target: 5000 },
    { duration: '3m', target: 10000 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const ACCOUNT = 'whatsapp:+15559999';

export function setup() {
  const email = `load-mixed-${Date.now()}@onx.test`;
  const password = 'StrongPass123!';
  http.post(`${BASE}/auth/register`, JSON.stringify({ name: 'Load', email, password }), {
    headers: JSON_HEADERS,
  });
  const login = http.post(`${BASE}/auth/login`, JSON.stringify({ email, password }), {
    headers: JSON_HEADERS,
  });
  const token = login.json('accessToken');
  const auth = { headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` } };
  http.post(
    `${BASE}/connectors/whatsapp/config`,
    JSON.stringify({ provider: 'twilio', isActive: true, settings: { account: ACCOUNT } }),
    auth,
  );
  const me = http.get(`${BASE}/auth/me`, auth);
  return { token, workspaceId: me.json('workspaceId') };
}

export default function (data) {
  const auth = { headers: { ...JSON_HEADERS, Authorization: `Bearer ${data.token}` } };
  const roll = Math.random();
  let res;

  if (roll < 0.4) {
    res = http.post(
      `${BASE}/sech/route`,
      JSON.stringify({ checkType: 'pre_decision', domains: ['operational'], signals: {} }),
      auth,
    );
  } else if (roll < 0.7) {
    res = http.post(
      `${BASE}/ai/query`,
      JSON.stringify({ query: 'Summarize FIC constraints', domain: 'strategic' }),
      auth,
    );
  } else if (roll < 0.9) {
    res = http.post(
      `${BASE}/connectors/whatsapp/webhook?workspaceId=${data.workspaceId}`,
      JSON.stringify({ MessageSid: `SM-${__VU}-${__ITER}`, From: 'x', To: ACCOUNT, Body: 'hi' }),
      { headers: JSON_HEADERS },
    );
  } else {
    res = http.get(`${BASE}/monitoring/health`);
  }

  check(res, {
    'no 5xx (no constitutional corruption)': (r) => r.status < 500,
    'p95 < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);
}
