// Shared k6 configuration for ONX Intelligence load scenarios (M-15).
// Targets: p95 < 500ms, error rate < 1%.
//
// BASE_URL is supplied at runtime, e.g.:
//   k6 run -e BASE_URL=https://onx-intelligence-staging.onrender.com tests/load/smoke.js

export const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
export const BRIDGE_KEY = __ENV.BRIDGE_KEY || "";

// Pass/fail thresholds shared by every scenario. A run that breaches any of
// these exits non-zero, so it can gate a pipeline.
export const THRESHOLDS = {
  http_req_failed: ["rate<0.01"], // < 1% errors
  http_req_duration: ["p(95)<500"], // p95 < 500ms
  checks: ["rate>0.99"], // > 99% of functional checks pass
};

// Endpoints exercised. health.ping is the cheapest liveness proof; the
// plain /health route is dependency-light. tRPC batch inputs are empty JSON.
export const ENDPOINTS = {
  health: `${BASE_URL}/health`,
  healthPing: `${BASE_URL}/api/trpc/health.ping?batch=1&input=%7B%7D`,
  constitutionPrinciples: `${BASE_URL}/api/trpc/constitution.principles?batch=1&input=%7B%7D`,
};

export function bridgeHeaders() {
  return BRIDGE_KEY ? { "x-onx-bridge-key": BRIDGE_KEY } : {};
}
