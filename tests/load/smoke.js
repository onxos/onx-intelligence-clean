// Scenario 1 — SMOKE (M-15)
// Minimal load: verifies the system works and meets thresholds under a
// single VU. Run this first; if it fails, do not bother with heavier runs.
import http from "k6/http";
import { check, sleep } from "k6";
import { ENDPOINTS, THRESHOLDS } from "./config.js";

export const options = {
  vus: 1,
  duration: "1m",
  thresholds: THRESHOLDS,
};

export default function () {
  const res = http.get(ENDPOINTS.health);
  check(res, {
    "status is 200": (r) => r.status === 200,
    "reports ALIVE": (r) => String(r.body).includes("ALIVE"),
  });
  sleep(1);
}
