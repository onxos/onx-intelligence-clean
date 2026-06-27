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
