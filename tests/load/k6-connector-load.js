import http from 'k6/http';
import { check, sleep } from 'k6';

// Verifies the public WhatsApp webhook under load (rate limit: 120/min per IP).
// The connector must be configured + active for the workspace; setup() does that.
// k6 run -e BASE_URL=http://localhost:3000 tests/load/k6-connector-load.js
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
const ACCOUNT = 'whatsapp:+15559999';

export function setup() {
  const email = `load-conn-${Date.now()}@onx.test`;
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
  return { workspaceId: me.json('workspaceId') };
}

export default function (data) {
  const res = http.post(
    `${BASE}/connectors/whatsapp/webhook?workspaceId=${data.workspaceId}`,
    JSON.stringify({
      MessageSid: `SM-${__VU}-${__ITER}`,
      From: 'whatsapp:+15550001',
      To: ACCOUNT,
      Body: 'my dog is limping',
    }),
    { headers: JSON_HEADERS },
  );

  check(res, {
    'accepted / rate-limited (120/min)': (r) => [200, 201, 429].includes(r.status),
    'p95 < 500ms': (r) => r.timings.duration < 500,
    'no 5xx': (r) => r.status < 500,
  });
  sleep(1);
}
