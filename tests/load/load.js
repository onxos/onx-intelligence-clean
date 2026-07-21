// Scenario 2 — AVERAGE LOAD (M-15)
// Sustained expected traffic. Ramps to a steady VU plateau and holds, to
// prove the service meets p95<500ms / err<1% under normal conditions.
import http from "k6/http";
import { check, sleep } from "k6";
import { ENDPOINTS, THRESHOLDS } from "./config.js";

export const options = {
  stages: [
    { duration: "1m", target: 20 }, // ramp up
    { duration: "3m", target: 20 }, // steady state
    { duration: "1m", target: 0 }, // ramp down
  ],
  thresholds: THRESHOLDS,
};

export default function () {
  // Mix of the liveness route and a real (read-only) tRPC procedure.
  const health = http.get(ENDPOINTS.healthPing);
  check(health, { "health 200": (r) => r.status === 200 });

  const principles = http.get(ENDPOINTS.constitutionPrinciples);
  check(principles, { "principles 200": (r) => r.status === 200 });

  sleep(1);
}
