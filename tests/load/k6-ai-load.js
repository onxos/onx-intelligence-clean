import http from 'k6/http';
import { check, sleep } from 'k6';

// Verifies the AI query path under load (rate limit: 30/min per IP).
// k6 run -e BASE_URL=http://localhost:3000 tests/load/k6-ai-load.js
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
    http_req_failed: ['rate<0.01'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function setup() {
  const email = `load-ai-${Date.now()}@onx.test`;
  const password = 'StrongPass123!';
  http.post(`${BASE}/auth/register`, JSON.stringify({ name: 'Load', email, password }), {
    headers: JSON_HEADERS,
  });
  const login = http.post(`${BASE}/auth/login`, JSON.stringify({ email, password }), {
    headers: JSON_HEADERS,
  });
  return { token: login.json('accessToken') };
}

export default function (data) {
  const res = http.post(
    `${BASE}/ai/query`,
    JSON.stringify({
      query: 'Differential diagnoses for a 4-year-old Golden Retriever with hind-leg lameness?',
      domain: 'clinical',
    }),
    { headers: { ...JSON_HEADERS, Authorization: `Bearer ${data.token}` } },
  );

  check(res, {
    'answered / rate-limited (30/min)': (r) => [200, 201, 429].includes(r.status),
    'p95 < 500ms': (r) => r.timings.duration < 500,
    'no 5xx': (r) => r.status < 500,
  });
  sleep(1);
}
