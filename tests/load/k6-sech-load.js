import http from 'k6/http';
import { check, sleep } from 'k6';

// Usage: k6 run -e BASE_URL=http://localhost:3000 tests/load/k6-sech-load.js
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
    // NOTE: SECH is rate-limited to 10/min per IP; under heavy load 429s are
    // EXPECTED and constitutionally correct — evaluate via checks, not failure rate.
    http_req_failed: ['rate<0.01'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function setup() {
  const email = `load-sech-${Date.now()}@onx.test`;
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
    `${BASE}/sech/route`,
    JSON.stringify({
      checkType: 'pre_decision',
      decisionContext: 'Adjust clinic slot by 30 minutes',
      domains: ['operational'],
      signals: {},
    }),
    { headers: { ...JSON_HEADERS, Authorization: `Bearer ${data.token}` } },
  );

  check(res, {
    'accepted / blocked / rate-limited': (r) => [200, 201, 403, 409, 429].includes(r.status),
    'p95 < 500ms': (r) => r.timings.duration < 500,
    'no 5xx (no constitutional corruption)': (r) => r.status < 500,
  });
  sleep(1);
}
