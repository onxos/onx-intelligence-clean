# CRP-01 Gap Register

## Open Gaps Observed in Current Baseline

- ISES-12: hardened and covered by unit test
- ISMF-6: implemented and covered by unit test
- Soft delete: closed (MO-011, production-verified)
- Automated smoke tests: installed as executable repository behavior
- Full constitutional CRUD completeness: partial
- Full audit trail coverage: closed (MO-012, production-verified)
- Memory governance: closed (MO-013, production-verified)
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

## Mission Order 011 Sprint 1 Record (2026-06-27)

- Selected V2 item (first ready by dependency order): Soft delete
- Scope implemented (no architecture redesign):
	- Converted hard delete paths to soft delete/archive in domain services:
		- `intelligence` -> archive via `state=ARCHIVED`
		- `provider` and `tool` -> disable via `status=INACTIVE`
		- `projects` and `agents` -> archive via `status=ARCHIVED`
		- `evidence`, `sources(provenance)`, `memory`, `provider evaluations` -> tombstone via `deleted_at`
	- Added default read filters to exclude archived/inactive/deleted records.
	- Added migration: `20260627164000_soft_delete_v2`.
	- Added e2e evidence assertion for evidence soft delete visibility.
- Verification evidence:
	- Delivery commit: `c4201cd804946f0129861513b3eb1b425ad1fd73`
	- Build: success (`npm run build`)
	- Unit tests: success (`npm test`)
	- E2E tests: success (`npm run test:e2e`)
	- CI: success https://github.com/onxos/onx-intelligence-clean/actions/runs/28295133220
	- Render deploy: success https://github.com/onxos/onx-intelligence-clean/actions/runs/28295133223
	- Production `/commit`: `{"commit":"c4201cd804946f0129861513b3eb1b425ad1fd73","nodeEnv":"production"}`
	- Production `/health`: `{"status":"ok","database":{"status":"up","version":"1.0.0"}}`
	- Production smoke: success (`BASE_URL=https://onx-intelligence-clean.onrender.com npm run smoke`)
	- Practical closure proof:
		- Intelligence soft delete: delete then `GET /intelligence/:id` => `404`
		- Evidence soft delete: delete then `GET /evidence` excludes deleted id

## Mission Order 012 Sprint 2 Record (2026-06-27)

- Selected V2 item: Full audit trail coverage
- Scope implemented (no architecture redesign):
	- Migrated audit persistence to unified event structure with canonical fields.
	- Added request-context capture (`requestId`, `ipAddress`, `userAgent`) and success/failure semantics.
	- Added/standardized audit writes for mutating flows across `auth`, `intelligence`, `evidence`, `provider`, `tool`, `workspace`, `sovereignty`.
	- Added e2e verification for:
		- Create -> Audit
		- Update -> Audit
		- Delete/Soft Delete -> Audit
		- Failure -> Audit (FAILED + success=false)
		- Unauthorized -> No Audit
- Verification evidence:
	- Implementation commit: `ddf2c5f1116ee9bf768e92c84f35bdbb0e052143`
	- CI formatting follow-up commit: `b957f10156fa9aba1170fe7ba4ba500324b9d0e6`
	- Build: success (`npm run build`)
	- Unit tests: success (`npm test`)
	- E2E tests: success (`npm run test:e2e`)
	- CI (final SHA): success https://github.com/onxos/onx-intelligence-clean/actions/runs/28295889275
	- Render deploy (final SHA): success https://github.com/onxos/onx-intelligence-clean/actions/runs/28295889279
	- Production `/commit`: `{"commit":"b957f10156fa9aba1170fe7ba4ba500324b9d0e6","nodeEnv":"production"}`
	- Production `/health`: `{"status":"ok","database":{"status":"up","version":"1.0.0"}}`
	- Production smoke: success (`BASE_URL=https://onx-intelligence-clean.onrender.com npm run smoke`)

## Mission Order 013 Closure Verification Record (2026-06-27)

- Verification mode: read/verify only, plus governance record completion where prior closure evidence was stale.
- Target closure commit: `b78599bcd0c489739874708260a140a602b4586b`
- Repository status:
	- Local `main` == `origin/main`
	- No tracked changes pending during verification
	- No open PRs
- Workflow evidence for closure commit:
	- CI: success https://github.com/onxos/onx-intelligence-clean/actions/runs/28296058571
	- Render deploy: success https://github.com/onxos/onx-intelligence-clean/actions/runs/28296058585
- Production evidence:
	- `/commit`: `{"commit":"b78599bcd0c489739874708260a140a602b4586b","nodeEnv":"production"}`
	- `/health`: `{"status":"ok","database":{"status":"up","version":"1.0.0"}}`
	- Smoke: success (`BASE_URL=https://onx-intelligence-clean.onrender.com npm run smoke`)
- Live audit proof:
	- Verified `AUTH_REGISTERED`, `AUTH_LOGGED_IN`, `EVIDENCE_CREATED`, `EVIDENCE_UPDATED`, `EVIDENCE_DELETED`
	- Verified fields present on live audit entries: `actorId`, `resourceType`, `resourceId`, `action`, `timestamp`, `status`, `success`, `metadata`

## Mission Order 013 Memory Governance Record (2026-06-27)

- Selected V2 item: Memory governance
- Scope implemented (no architecture redesign):
	- Extended `memory_entries` with governance fields: classification, access scope, lifecycle status, retention days, and expiry timestamp.
	- Enforced server-side memory policy validation for classification/access-scope combinations, retention limits, tag/query bounds, and sort/query whitelists.
	- Added lifecycle enforcement for locked and expired memory plus owner-only visibility for restricted memory within existing workspace CRUD endpoints.
	- Added mutation audit metadata for governed memory create/update/delete and extended smoke coverage to the `/memory` path.
- Verification evidence:
	- Implementation commit: `b5f745bcf12f400fafaddd30b2003132b2122e5e`
	- Deployment fix commit: `72afd605a375fda762ce1b4f0799b5526b3db91a`
	- Build: success (`npm run build`)
	- Unit tests: success (`npm test`)
	- E2E tests: success (`npm run test:e2e`)
	- CI (final SHA): success https://github.com/onxos/onx-intelligence-clean/actions/runs/28297736042
	- Render deploy (final SHA): success https://github.com/onxos/onx-intelligence-clean/actions/runs/28297736046
	- Production `/commit`: `{"commit":"72afd605a375fda762ce1b4f0799b5526b3db91a","nodeEnv":"production"}`
	- Production `/health`: `{"status":"ok","database":{"status":"up","version":"1.0.0"}}`
	- Production smoke: success (`BASE_URL=https://onx-intelligence-clean.onrender.com npm run smoke`)
	- Practical closure proof:
		- Restricted owner-only memory visibility: owner sees created memory, peer in same workspace does not (`owner_can_see=1`, `peer_can_see=0`)
		- Memory audit events present live: `MEMORY_CREATED`, `MEMORY_UPDATED`, `MEMORY_DELETED`
		- Audit metadata present live: `classification`, `accessScope`, `lifecycleStatus`, `retentionDays`, `expiresAt`
