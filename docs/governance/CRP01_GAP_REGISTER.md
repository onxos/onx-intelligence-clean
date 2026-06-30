# CRP-01 Gap Register

## Open Gaps Observed in Current Baseline

- ISES-12: hardened and covered by unit test
- ISMF-6: implemented and covered by unit test
- Soft delete: closed (MO-011, production-verified)
- Automated smoke tests: installed as executable repository behavior
- Full constitutional CRUD completeness: closed (MO-015, production-verified)
- Full audit trail coverage: closed (MO-012, production-verified)
- Memory governance: closed (MO-013, production-verified)
- Reporting depth: closed (MO-016, production-verified)
- Workspace domain completeness: closed (MO-015, production-verified)
- Capital allocation: closed (AV6-01 merged to main, production-verified)
- Founder Intent Compiler: deferred (Atlas V6 only)
- USFIP: deferred (Future Research)
- Proof Stress Architecture: deferred (Future Research)

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

## Mission Order 015 Full Constitutional CRUD Completeness Record (2026-06-27)

- Selected V2 item: Full constitutional CRUD completeness
- Scope implemented (no architecture redesign, no new domain creation):
	- Closed read-parity gaps by adding missing read-by-id coverage for existing constitutional modules:
		- `evidence`: `GET /evidence/:id`
		- `provider`: `GET /providers/:id`
		- `tool`: `GET /tools/:id`
		- `workspace agents`: `GET /agents/:id`
		- `workspace memory`: `GET /memory/:id`
	- Preserved existing authorization and soft-delete policies per module.
	- Preserved memory governance policy compatibility on direct read path (`OWNER_ONLY` visibility constraints remain enforced).
	- Added e2e coverage for all new read-by-id paths and their authorization/soft-delete behavior.
- Verification evidence:
	- Implementation commit: `975e7a8128ad361dd48cb7c81fbe17276f02aa65`
	- Build: success (`npm run build`)
	- Unit tests: success (`npm test`)
	- E2E tests: success (`npm run test:e2e`)
	- CI: success https://github.com/onxos/onx-intelligence-clean/actions/runs/28298411961
	- Render deploy: success https://github.com/onxos/onx-intelligence-clean/actions/runs/28298411946
	- Production `/commit`: `{"commit":"975e7a8128ad361dd48cb7c81fbe17276f02aa65","nodeEnv":"production"}`
	- Production `/health`: `{"status":"ok","database":{"status":"up","version":"1.0.0"}}`
	- Production smoke: success (`BASE_URL=https://onx-intelligence-clean.onrender.com npm run smoke`)
	- Live practical CRUD proof: PASS
		- Direct read-by-id verified live for `evidence`, `provider`, `tool`, `agents`, `memory`.
		- Pagination/filter verified live on list paths.
		- Authorization verified live via peer access denial.
		- Validation verified live (`RESTRICTED` memory with non-`OWNER_ONLY` rejected).
		- Soft delete verified live by post-delete `404` on read paths.
		- Audit verified live for create/update/delete across intelligence, evidence, provider, tool, and workspace-domain entities, with memory governance metadata present.

## Mission Order 016 Reporting Depth Record (2026-06-27)

- Selected V2 item: Reporting depth
- Scope implemented (no architecture redesign, no new domain creation):
	- Deepened existing reporting APIs in workspace module with production-grade query capabilities:
		- `GET /reports`
		- `GET /reports/governance`
		- `GET /reports/capital`
		- `GET /monitoring`
		- `GET /monitoring/audit`
		- `GET /monitoring/audit/:id`
	- Added consistent validated DTO query contracts for reporting and monitoring endpoints.
	- Added date-range validation (`from`/`to`), pagination, filtering, sorting, and search support.
	- Added aggregated reporting sections across constitutional modules: statistics, counts, health summary, audit summary, memory summary, CRUD activity summary, provider/workspace summaries, error summary, validation summary, and sovereignty summary.
	- Added optional detailed report blocks via `includeDetails=true` with module selection (`all|intelligence|evidence|provider|tool|workspace|memory|sovereignty`).
	- Preserved backward compatibility of existing endpoints and response fields.
	- Preserved authorization and memory governance compatibility (`OWNER_ONLY` memory visibility remains enforced in reporting details).
- Verification evidence:
	- Implementation commit: `7b268571cbddfa06def25483f6823df278a855b1`
	- CI hardening follow-up commit: `29b5054c35930e5df812f44d3be372d6a6610542`
	- Build: success (`npm run build`)
	- Unit tests: success (`npm test`)
	- E2E tests: success (`npm run test:e2e`)
	- Smoke: success (`BASE_URL=https://onx-intelligence-clean.onrender.com npm run smoke`)
	- CI (final SHA): success https://github.com/onxos/onx-intelligence-clean/actions/runs/28299132424
	- Render deploy (final SHA): success https://github.com/onxos/onx-intelligence-clean/actions/runs/28299132407
	- Production `/commit`: `{"commit":"7b268571cbddfa06def25483f6823df278a855b1","nodeEnv":"production"}`
	- Production `/health`: `{"status":"ok","database":{"status":"up","version":"1.0.0"}}`
	- Live reporting verification: PASS
		- Summary reports: present (`snapshot`, `statistics`, `counts`, `healthSummary`, `auditSummary`, `memorySummary`, `crudActivitySummary`, `providerSummary`, `workspaceSummary`, `errorSummary`, `validationSummary`).
		- Detailed reports: present with `includeDetails=true` and module selection.
		- Pagination/filtering/sorting/date-range: verified live.
		- Invalid date-range validation: `400` verified live.
		- Authorization: unauthenticated `reports` and `monitoring` requests return `401`.
		- Audit compatibility: `monitoring/audit` list and details verified live.
		- Memory compatibility: memory summaries and governed memory details verified live.

## Mission Order 015 Workspace Domain Completion Closure Record (2026-06-28)

- Selected V2 item: Workspace domain completeness closure (production-first, existing domain only)
- Scope verified live:
	- Workspace CRUD parity on existing workspace endpoints: projects, sources, agents, memory.
	- Restore parity verified live on soft-deleted workspace entities.
	- Authorization parity verified live through cross-user denial on protected workspace resources.
	- Validation parity verified live for pagination bounds and governed memory policy constraints.
	- Compatibility verified live for reports, monitoring, memory governance, and sovereignty endpoints.
- Verification evidence:
	- Final production commit: `90bd7ada60ef087ec3e14173505268de6f634971`
	- CI (final SHA): success https://github.com/onxos/onx-intelligence-clean/actions/runs/28299907447
	- Render deploy (final SHA): success https://github.com/onxos/onx-intelligence-clean/actions/runs/28299907453
	- Production `/commit`: `{"commit":"90bd7ada60ef087ec3e14173505268de6f634971","nodeEnv":"production"}`
	- Production `/health`: `{"status":"ok","database":{"status":"up","version":"1.0.0"}}`
	- Production smoke: success (`BASE_URL=https://onx-intelligence-clean.onrender.com npm run smoke`)
	- `/tmp/mo015_verify.sh` final result: `all_pass=true`

## Mission Order 017 Remaining Scope Classification Record (2026-06-28)

- Mode: governance classification only (no implementation)
- Authoritative references reviewed:
	- `docs/governance/ONX_INTELLIGENCE_CONSTITUTIONAL_CORPUS.md`
	- `docs/governance/CRP01_GAP_REGISTER.md`
	- `docs/governance/V2_EXECUTION_REGISTER.md`
	- `docs/governance/V1_FREEZE.md`
	- `docs/governance/V1_CONSTITUTIONAL_SEAL.md`
- Remaining open gaps after MO-011/MO-012/MO-013/MO-015/MO-016/workspace completion:
	- Capital allocation
	- Founder Intent Compiler
	- USFIP
	- Proof Stress Architecture
- Classification decision (repository evidence only):
	- Capital allocation -> Atlas V6 only
	- Founder Intent Compiler -> Atlas V6 only
	- USFIP -> Future Research
	- Proof Stress Architecture -> Future Research
- Capital Allocation evidence-based determination:
	- Data/model capability exists (`CapitalRecord` model and `CapitalCategory` enum).
	- Runtime implementation is partial and read-only (`GET /reports/capital`, aggregate usage in reports).
	- No runtime allocation workflow is present for capital creation/decision/execution paths in `src/**`.
	- V2-safe execution without redesign is not established by current constitutional runtime evidence.
	- Decision: defer Capital Allocation to Atlas V6.

## Mission Order AV6-01 Merge and Production Verification Record (2026-06-28)

- PR: https://github.com/onxos/onx-intelligence-clean/pull/1
- Merge method: squash
- Merge commit (main): `6c850e1a1d2d179dd6eed5f24f3212677fde1e97`
- Implementation commit: `584dd69873643aba57db5687e8d033943f349e7c`
- Main CI: failed at lint step (follow-up required)
	- CI run: https://github.com/onxos/onx-intelligence-clean/actions/runs/28316881670
	- Failed job: https://github.com/onxos/onx-intelligence-clean/actions/runs/28316881670/job/83891711265
- Render deploy: success
	- Render run: https://github.com/onxos/onx-intelligence-clean/actions/runs/28316881675
- Production verification:
	- `/commit`: `{"commit":"6c850e1a1d2d179dd6eed5f24f3212677fde1e97","nodeEnv":"production"}`
	- `/health`: `{"status":"ok","database":{"status":"up","version":"1.0.0"}}`
	- Smoke: PASS (`BASE_URL=https://onx-intelligence-clean.onrender.com npm run smoke`)
	- Capital allocation API proof: PASS (create/read/update/approve/reject on separate allocation/delete/restore/list)
	- Capital policy API proof: PASS (create/read/update/delete/restore/list)
	- Capital reports/history proof: PASS (`GET /capital/reports`, `GET /capital/history`)
	- Capital audit proof: PASS (`GET /monitoring/audit?search=CAPITAL_` includes capital actions)
	- Production OpenAPI proof: PASS (Capital DTOs and `/capital/allocations`, `/capital/policies`, `/capital/reports`, `/capital/history` documented)
- Remaining Atlas V6 scope:
	- Founder Intent Compiler (deferred)
	- USFIP (future research)
	- Proof Stress Architecture (future research)

## Mission Order AV6-01G Governance Closure Record (2026-06-28)

- Mode: governance update only (no application/runtime/Prisma changes)
- AV6-01 status: CLOSED
- Capital Allocation status: COMPLETE
- Final implementation/closure commit: `ff3fd7fb37fa436c5d46816e589c2066ef82b5d5`
- CI: success
	- Run: https://github.com/onxos/onx-intelligence-clean/actions/runs/28318069935
- Render: success
	- Run: https://github.com/onxos/onx-intelligence-clean/actions/runs/28318069946
- Production synchronization: PASS
	- `/commit`: `{"commit":"ff3fd7fb37fa436c5d46816e589c2066ef82b5d5","nodeEnv":"production"}`
	- `/health`: `{"status":"ok"}`
	- Smoke: PASS (`BASE_URL=https://onx-intelligence-clean.onrender.com npm run smoke`)
	- Regression: PASS (`npm run lint`, `npm run build`, `npm test`, `npm run test:e2e`)
- Remaining Atlas V6 scope:
	- Founder Intent Compiler
	- USFIP: Future Research
	- Proof Stress Architecture: Future Research

## Mission Order MO-032 Capital Runtime Repair Publication Record (2026-06-29)

- Mode: execution + publication + verification (no architecture redesign)
- Runtime breach status: CLOSED
	- Removed in-memory capital runtime/fallback logic from `src/capital/capital.service.ts`
	- Removed `canUseDatabase` runtime bifurcation
	- Enforced Prisma-only persistence path for allocations, policies, reports, history, approvals, and decisions
- Implementation commit:
	- `c3a50a587027506b40816e010ef42f8a3d487e3d`
	- Message: `fix(capital): enforce Prisma-only runtime for ACE lock`
- CI: success
	- Run: https://github.com/onxos/onx-intelligence-clean/actions/runs/28349763882
- Render: success
	- Run: https://github.com/onxos/onx-intelligence-clean/actions/runs/28349763890
- Production synchronization: PASS
	- `/commit`: `{"commit":"c3a50a587027506b40816e010ef42f8a3d487e3d","nodeEnv":"production"}`
	- `/health`: `{"status":"ok","database":{"status":"up","version":"1.0.0"}}`
	- Smoke: PASS (`BASE_URL=https://onx-intelligence-clean.onrender.com npm run smoke`)
- Production capital verification: PASS
	- Allocations: create/read/update/approve/reject(separate allocation)/soft delete/restore/list
	- Policies: create/read/update/soft delete/restore/list
	- Reports: PASS (`GET /capital/reports`)
	- History: PASS (`GET /capital/history`)
	- Audit: PASS (`GET /monitoring/audit` contains capital events)
- OpenAPI verification: PASS
	- `/capital/allocations`, `/capital/policies`, `/capital/reports`, `/capital/history` documented
	- Allocation/Policy/Action DTOs present
	- Report/History DTOs are not separately defined in schema components; endpoint coverage validated

## RWO-01 Repository Implementation Completion Record (2026-06-30)

- Mode: repository execution (implementation defect repair only)
- Scope executed:
	- Runtime integrity repair: fixed Docker Compose app start command to `node dist/src/main.js`.
	- API/runtime integrity repair: auth service now short-circuits with `503 Database unavailable` when Prisma is offline instead of surfacing Prisma initialization exceptions.
	- Runtime integrity hardening: Prisma startup now skips DB connect attempt when `DATABASE_URL` is unset and enters explicit degraded mode.
- Verification evidence (local `main` execution):
	- CI-equivalent pipeline: PASS (`npm run ci`)
	- Database integrity: PASS (`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/onx?schema=public npm run db:deploy`, `npm run db:seed`, `npx prisma migrate status`)
	- Smoke: PASS (`BASE_URL=http://localhost:3000 bash scripts/smoke.sh` against local production start)
- Result:
	- No new constitutional or Atlas scope introduced.
	- Implementation register synchronized to current repository behavior.
