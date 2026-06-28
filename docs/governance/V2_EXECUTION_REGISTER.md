## V2 Scope

- Scope remains governance-controlled; implementation work starts only after gate unlock verification.

## Entry Criteria

- V1 Freeze baseline deployed and verified in production.
- CI and Render successful for unlock commit.
- Production smoke passes.

## Exit Criteria

- V2 work items completed under constitutional governance and approved closure criteria.

## Governance Rules

- V1 baseline is immutable except security patches, verified bug fixes, and operational hotfixes.
- No V2 implementation starts without explicit gate unlock evidence in this register.

## Approved Work Items

- Sprint 1 (MO-011): Soft Delete across active delete paths (backend API + workspace domain)
	- Dependency graph basis (from runtime modules/services):
		- Common dependency: `PrismaService` used by `IntelligenceService`, `EvidenceService`, `ProviderService`, `ToolService`, `WorkspaceService`.
		- Delete path dependencies:
			- `IntelligenceController` -> `IntelligenceService.remove`
			- `EvidenceController` -> `EvidenceService.remove`
			- `ProviderController` -> `ProviderService.remove`
			- `ToolController` -> `ToolService.remove`
			- `WorkspaceController` -> `WorkspaceService.delete*` for projects/knowledge/sources/agents/memory/evaluations
	- Production-ready status: COMPLETED
	- Delivery commit: c4201cd804946f0129861513b3eb1b425ad1fd73
	- CI: https://github.com/onxos/onx-intelligence-clean/actions/runs/28295133220
	- Render: https://github.com/onxos/onx-intelligence-clean/actions/runs/28295133223
	- Smoke: PASS (`BASE_URL=https://onx-intelligence-clean.onrender.com npm run smoke`)
	- Live practical proof: PASS (intelligence soft delete returns 404 after delete, evidence hidden from list after delete)
- Sprint 2 (MO-012): Full Audit Trail Coverage (unified event model + mutating-path coverage)
	- Scope delivered:
		- Unified audit schema fields (`eventId`, `timestamp`, `resourceType`, `before`, `after`, `requestId`, `userAgent`, `status`, `success`, `metadata`).
		- Centralized logging contract in `AuditService` and request-context extraction utility.
		- Success/failure audit logging across mutating endpoints in `auth`, `intelligence`, `evidence`, `provider`, `tool`, `workspace`, `sovereignty`.
		- E2E audit assertions for Create/Update/Delete, soft delete paths, failure-path logging, and unauthorized-no-audit behavior.
	- Production-ready status: COMPLETED
	- Implementation commit: ddf2c5f1116ee9bf768e92c84f35bdbb0e052143 (`feat(v2): complete audit trail coverage`)
	- CI hardening follow-up: b957f10156fa9aba1170fe7ba4ba500324b9d0e6 (`fix(ci): apply lint formatting for MO-012 audit coverage`)
	- CI (final deployed SHA): https://github.com/onxos/onx-intelligence-clean/actions/runs/28295889275
	- Render (final deployed SHA): https://github.com/onxos/onx-intelligence-clean/actions/runs/28295889279
	- Production `/commit`: `{"commit":"b957f10156fa9aba1170fe7ba4ba500324b9d0e6","nodeEnv":"production"}`
	- Production `/health`: `{"status":"ok","database":{"status":"up","version":"1.0.0"}}`
	- Smoke: PASS (`BASE_URL=https://onx-intelligence-clean.onrender.com npm run smoke`)
	- Closure verification commit: b78599bcd0c489739874708260a140a602b4586b (`docs(governance): record MO-012 audit trail closure`)
	- Closure verification CI: https://github.com/onxos/onx-intelligence-clean/actions/runs/28296058571
	- Closure verification Render: https://github.com/onxos/onx-intelligence-clean/actions/runs/28296058585
	- Closure verification production `/commit`: `{"commit":"b78599bcd0c489739874708260a140a602b4586b","nodeEnv":"production"}`
- MO-013: Memory Governance (server-side policy, lifecycle, retention, access, audit)
	- Scope delivered:
		- Added governed memory schema fields for `classification`, `accessScope`, `lifecycleStatus`, `retentionDays`, and `expiresAt`.
		- Enforced server-side memory policy validation, query validation, lifecycle locking/expiry, and owner-only visibility rules within existing workspace memory CRUD.
		- Preserved backward-compatible `/memory` CRUD while adding memory mutation audit metadata and workspace consistency enforcement.
		- Added unit and e2e coverage plus smoke coverage for governed memory create/list/delete.
	- Production-ready status: COMPLETED
	- Implementation commit: b5f745bcf12f400fafaddd30b2003132b2122e5e (`feat(v2): implement memory governance`)
	- Deployment fix commit: 72afd605a375fda762ce1b4f0799b5526b3db91a (`fix(deploy): align memory seed with governance schema`)
	- CI (final deployed SHA): https://github.com/onxos/onx-intelligence-clean/actions/runs/28297736042
	- Render (final deployed SHA): https://github.com/onxos/onx-intelligence-clean/actions/runs/28297736046
	- Production `/commit`: `{"commit":"72afd605a375fda762ce1b4f0799b5526b3db91a","nodeEnv":"production"}`
	- Production `/health`: `{"status":"ok","database":{"status":"up","version":"1.0.0"}}`
	- Smoke: PASS (`BASE_URL=https://onx-intelligence-clean.onrender.com npm run smoke`)
	- Live practical proof: PASS (restricted owner-only memory visible to owner and hidden from peer; audit captured `MEMORY_CREATED`, `MEMORY_UPDATED`, `MEMORY_DELETED` with governance metadata)
- MO-015: Full Constitutional CRUD Completeness (existing domains only, production-first)
	- Scope delivered:
		- Added missing read-by-id coverage to existing modules without introducing new domains or architecture changes:
			- `GET /evidence/:id`
			- `GET /providers/:id`
			- `GET /tools/:id`
			- `GET /agents/:id`
			- `GET /memory/:id`
		- Preserved module-specific authorization, soft-delete semantics, and memory governance constraints.
		- Extended e2e tests to verify new read-by-id paths and enforce authorization/soft-delete behavior.
	- Production-ready status: COMPLETED
	- Implementation commit: 975e7a8128ad361dd48cb7c81fbe17276f02aa65 (`feat(v2): complete CRUD read parity across constitutional modules`)
	- CI: https://github.com/onxos/onx-intelligence-clean/actions/runs/28298411961
	- Render: https://github.com/onxos/onx-intelligence-clean/actions/runs/28298411946
	- Production `/commit`: `{"commit":"975e7a8128ad361dd48cb7c81fbe17276f02aa65","nodeEnv":"production"}`
	- Production `/health`: `{"status":"ok","database":{"status":"up","version":"1.0.0"}}`
	- Smoke: PASS (`BASE_URL=https://onx-intelligence-clean.onrender.com npm run smoke`)
	- Live practical proof: PASS (CRUD + pagination/filtering + authorization + validation + audit + soft-delete + memory governance compatibility verified across constitutional modules)
- MO-016: Reporting Depth (production-first within existing constitutional domains)
	- Scope delivered:
		- Upgraded existing reporting and monitoring paths with validated query DTOs and deeper reporting coverage:
			- `/reports`, `/reports/governance`, `/reports/capital`
			- `/monitoring`, `/monitoring/audit`, `/monitoring/audit/:id`
		- Added pagination, filtering, sorting, search, and date-range support for reporting paths.
		- Added aggregated summary sections across constitutional modules (statistics, counts, health, audit, memory, CRUD activity, provider/workspace, errors, validation, sovereignty).
		- Added optional detailed report modules via `includeDetails=true` and module selector (`all|intelligence|evidence|provider|tool|workspace|memory|sovereignty`).
		- Preserved backward-compatible endpoint contracts and memory governance authorization behavior.
		- Added unit and e2e coverage for reporting depth behavior and validation.
	- Production-ready status: COMPLETED
	- Implementation commit: 7b268571cbddfa06def25483f6823df278a855b1 (`feat(v2): deepen reporting layer across constitutional modules`)
	- CI hardening follow-up: 29b5054c35930e5df812f44d3be372d6a6610542 (`fix(ci): format reporting-depth implementation`)
	- CI (final SHA): https://github.com/onxos/onx-intelligence-clean/actions/runs/28299132424
	- Render (final SHA): https://github.com/onxos/onx-intelligence-clean/actions/runs/28299132407
	- Production `/commit`: `{"commit":"7b268571cbddfa06def25483f6823df278a855b1","nodeEnv":"production"}`
	- Production `/health`: `{"status":"ok","database":{"status":"up","version":"1.0.0"}}`
	- Smoke: PASS (`BASE_URL=https://onx-intelligence-clean.onrender.com npm run smoke`)
	- Live reporting proof: PASS (summary + details + pagination + filtering + sorting + date-range validation + authorization + audit compatibility + memory compatibility)

## Blocked Work Items

## Change Log

- V2 Gate Status: UNLOCKED
- Unlock commit: f4a549bf79372568aa02995791b392b34f6a217d
- CI evidence: https://github.com/onxos/onx-intelligence-clean/actions/runs/28294652411
- Render evidence: https://github.com/onxos/onx-intelligence-clean/actions/runs/28294652404
- Smoke evidence: PASS (`BASE_URL=https://onx-intelligence-clean.onrender.com npm run smoke`)
- Production URL: https://onx-intelligence-clean.onrender.com
- Unlock timestamp (UTC): 2026-06-27T16:18:50Z
- 2026-06-27 Sprint 1 complete: soft delete implementation verified on production commit c4201cd804946f0129861513b3eb1b425ad1fd73
- 2026-06-27 Sprint 2 complete: full audit trail coverage verified on production commit b957f10156fa9aba1170fe7ba4ba500324b9d0e6
- 2026-06-27 Memory governance complete: governed memory CRUD verified on production commit 72afd605a375fda762ce1b4f0799b5526b3db91a
- 2026-06-27 Full constitutional CRUD completeness complete: read-parity gaps closed and verified on production commit 975e7a8128ad361dd48cb7c81fbe17276f02aa65
- 2026-06-27 Reporting depth complete: reporting layer deepened and verified on production commit 7b268571cbddfa06def25483f6823df278a855b1
- 2026-06-28 MO-015 workspace domain completeness closure complete: workspace CRUD/restore/auth/validation/reporting/monitoring/memory/sovereignty compatibility verified on production commit 90bd7ada60ef087ec3e14173505268de6f634971 (CI 28299907447, Render 28299907453, smoke PASS, /tmp/mo015_verify.sh all_pass=true)
