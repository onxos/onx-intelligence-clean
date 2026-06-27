# CRP-01 Gap Register

## Open Gaps Observed in Current Baseline

- ISES-12: hardened and covered by unit test
- ISMF-6: implemented and covered by unit test
- Soft delete: missing
- Automated smoke tests: installed as executable repository behavior
- Full constitutional CRUD completeness: partial
- Full audit trail coverage: partial
- Memory governance: partial
- Reporting depth: partial
- Workspace domain completeness: partial
- Capital allocation: missing
- Founder Intent Compiler: missing
- USFIP: missing
- Proof Stress Architecture: missing

## Mission Order 006 Verification Record (2026-06-27)

- Verification mode: read/verify only, no feature or architecture changes
- Target commit under verification: `0239e9b43d15e4eb285027e40f1657382e374b35` (confirmed ancestor of `main`)
- Latest `main` commit verified live: `6c59c4336c63ecaeba6f057f5fc118b73858849c`
- CI run (`main`): success
	- Run: https://github.com/onxos/onx-intelligence-clean/actions/runs/28292424442
	- Build: success
	- Test: success
	- E2E Test: success
- Render deploy run (`main`): success
	- Run: https://github.com/onxos/onx-intelligence-clean/actions/runs/28292424457
	- Production URL: https://onx-intelligence-clean.onrender.com
	- Health: `/health` returned status `ok` with database `up`

### Authorized V1 Gap Closure (Verified)

- ISES-12: closed (live evidence)
	- `/providers/evaluate` returned `dimensionCount: 12` with 12 named dimensions
- ISMF-6: closed (live evidence)
	- `/sovereignty/evaluate` returned `metricCount: 6` and 6 metric names
- Automated smoke tests: closed (live evidence)
	- Verified live endpoints: `/health`, `/commit`, `/auth/register`, `/auth/login`, `/auth/me`, `/intelligence` create/list, `/providers`, `/tools`, `/sovereignty/evaluate`, `/evidence` create/list, `/workspace/home`, `/w/`

### Additional V1 Integrity Verification (Verified)

- Externalized i18n: verified (`workspace-ui/src/lib/locales/en.ts`, `workspace-ui/src/lib/locales/ar.ts`)
- RTL/LTR support: verified in live `/w/` HTML bootstrap script (locale switch sets `document.documentElement.dir` to `rtl` or `ltr`)
- Auth functional: verified live via register/login/me flow
- No password exposure: verified live auth responses return JWT only, without password/hash fields
- No simulated runtime endpoints: verified by source scan (`src/**`) with no runtime simulation endpoint markers
- No duplicate PrismaService: verified single declaration in `src/common/prisma.service.ts`
- No duplicate AuditService: verified single declaration in `src/common/audit.service.ts`
- No `server.js` fallback: verified container CMD uses `node dist/src/main.js`

## Mission Order 007 Commit Hash Consistency Record (2026-06-27)

- Scope: non-blocking V1 closure note from MO-006
- Root issue: production `/commit` could surface stale commit metadata precedence without a deterministic deploy-time commit source.
- Minimal fix applied:
	- `/commit` now prioritizes `ONX_DEPLOY_COMMIT` then `SOURCE_VERSION` before legacy commit env fallbacks.
	- Render deployment workflows now inject `ONX_DEPLOY_COMMIT=$GITHUB_SHA` during deploy configuration.
	- Render auto workflow hardened for cases where database API omits connection string (non-blocking reset skip + existing service `DATABASE_URL` fallback for deploy env update).
- Verification evidence:
	- Latest main after fix: `340b54a1e617ce92929f1023a8c21edc3ed43ff4`
	- CI success: https://github.com/onxos/onx-intelligence-clean/actions/runs/28294171388
	- Render deploy success: https://github.com/onxos/onx-intelligence-clean/actions/runs/28294171365
	- Live `/commit`: `{"commit":"340b54a1e617ce92929f1023a8c21edc3ed43ff4","nodeEnv":"production"}`
	- Live `/health`: status `ok`, database status `up`
	- Live smoke: passed (`npm run smoke` against production URL)
