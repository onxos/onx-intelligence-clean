# Load Testing — k6 Scenarios (M-15)

Four k6 scenarios exercise the live service against explicit pass/fail
thresholds:

- **p95 request duration < 500ms**
- **error rate < 1%**
- **> 99% of functional checks pass**

These thresholds are defined once in `config.js` and shared by every
scenario, so a run fails loudly (non-zero exit code) the moment any is
breached — safe to wire into a CI/CD gate.

## Scenarios

| File | Purpose | Profile |
|------|---------|---------|
| `smoke.js` | Sanity check — does it work at all? | 1 VU, 1 minute |
| `load.js` | Expected/average traffic | ramp to 20 VUs, hold 3 min |
| `stress.js` | Find the breaking point | ramp 50 → 100 → 200 VUs |
| `soak.js` | Long-running stability (leaks, degradation) | 15 VUs for ~30 min |

## Prerequisites

Install k6 (not a project dependency — a standalone binary):

```bash
# macOS
brew install k6
# Windows (winget)
winget install k6 --source winget
# Linux — see https://k6.io/docs/get-started/installation/
```

## Running against staging

```bash
k6 run -e BASE_URL=https://onx-intelligence-staging.onrender.com tests/load/smoke.js
k6 run -e BASE_URL=https://onx-intelligence-staging.onrender.com tests/load/load.js
k6 run -e BASE_URL=https://onx-intelligence-staging.onrender.com tests/load/stress.js
k6 run -e BASE_URL=https://onx-intelligence-staging.onrender.com tests/load/soak.js
```

Always run `smoke.js` first. Only proceed to `load.js` → `stress.js` →
`soak.js` if the previous scenario is green — there is no value in stressing
a system that already fails a basic smoke check.

**Run load tests against staging, never production**, unless you have
explicit sign-off and a maintenance window — `stress.js` and `soak.js` are
deliberately punishing.

### Optional: bridge-authenticated routes

Some tRPC procedures require the server-to-server bridge key
(`x-onx-bridge-key`). Pass it via `BRIDGE_KEY` if you extend a scenario to
hit those routes:

```bash
k6 run -e BASE_URL=... -e BRIDGE_KEY=*** tests/load/load.js
```

## Interpreting results

k6 prints a summary at the end of each run, including per-threshold
pass/fail. A scenario run exits with a non-zero code if any threshold in
`config.js` fails, e.g.:

```
✗ http_req_duration..............: p(95)=612ms
     ✓ 'p(95)<500' ...  ✗ FAILED

level=error msg="thresholds on metrics 'http_req_duration' have been crossed"
```

Treat any threshold failure as a release blocker for the change under test —
capture the k6 JSON summary (`--summary-export=results.json`) and attach it
to the PR/deployment record.

## CI integration (documented, not auto-wired)

These scenarios are **not** run automatically in `ci.yml` because they
require a live staging deployment and take up to ~40 minutes (soak). To run
them on demand from CI, add a manually-triggered workflow that:

1. Installs k6 (`grafana/k6-action` or the official Docker image).
2. Runs `smoke.js` and `load.js` against the staging URL secret.
3. Fails the job on any threshold breach (k6's own exit code does this).

`stress.js` / `soak.js` are best run manually ahead of a capacity review, not
on every push.
