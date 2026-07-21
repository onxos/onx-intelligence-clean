// Scenario 4 — SOAK (M-15)
// Extended-duration steady load to catch memory leaks, slow degradation,
// or resource exhaustion that only appear after sustained traffic.
import http from "k6/http";
import { check, sleep } from "k6";
import { ENDPOINTS, THRESHOLDS } from "./config.js";

export const options = {
  stages: [
    { duration: "2m", target: 15 }, // ramp up
    { duration: "30m", target: 15 }, // soak
    { duration: "2m", target: 0 }, // ramp down
  ],
  thresholds: THRESHOLDS,
};

export default function () {
  const res = http.get(ENDPOINTS.healthPing);
  check(res, { "status 200": (r) => r.status === 200 });
  sleep(1);
}
