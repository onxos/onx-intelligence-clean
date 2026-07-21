// Scenario 3 — STRESS (M-15)
// Pushes well beyond expected load to find the breaking point / degradation
// curve. Thresholds still apply: a passing stress run means headroom exists.
import http from "k6/http";
import { check, sleep } from "k6";
import { ENDPOINTS, THRESHOLDS } from "./config.js";

export const options = {
  stages: [
    { duration: "2m", target: 50 },
    { duration: "3m", target: 100 },
    { duration: "3m", target: 200 },
    { duration: "2m", target: 0 },
  ],
  thresholds: THRESHOLDS,
};

export default function () {
  const res = http.get(ENDPOINTS.healthPing);
  check(res, { "status 200": (r) => r.status === 200 });
  sleep(0.5);
}
