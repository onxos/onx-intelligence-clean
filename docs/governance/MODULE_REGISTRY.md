# Module Registry

| # | Module | Blueprint Ref | Status | Quality Gate | Notes |
|---|--------|--------------|--------|-------------|-------|
| 1 | rbac | Domain: Access Control | ✅ | 889/889 unit, 48/48 e2e | Built in Phase 0 |
| 2 | ai-agent | Domain: Intelligence Layer | ✅ | 889/889 unit, 48/48 e2e | Intent parser + handlers |
| 3 | plugin-system | Domain: Extensibility | ✅ | 889/889 unit, 48/48 e2e | Registry pattern |
| 4 | queue | Domain: Runtime Infrastructure | ✅ | 889/889 unit, 48/48 e2e | Queue + processors |
| 5 | webhook-signature | Domain: Security | ✅ | 889/889 unit, 48/48 e2e | HMAC verification |
| 6 | patient-lifecycle | Domain: Clinical | ✅ | 889/889 unit, 48/48 e2e | Core patient lifecycle |
| 7 | appointment-intelligence | Domain: Clinical | ✅ | 889/889 unit, 48/48 e2e | Scheduling intelligence |
| 8 | soap-intelligence | Domain: Clinical | ✅ | 889/889 unit, 48/48 e2e | SOAP generation/retrieval |
| 9 | diagnosis-support | Domain: Clinical | ✅ | 889/889 unit, 48/48 e2e | AI-assisted differential |
| 10 | order-intelligence | Domain: Clinical | ✅ | 889/889 unit, 48/48 e2e | Order recommendation |
| 11 | vitals-trending | Domain: Clinical | ✅ | 889/889 unit, 48/48 e2e | Trend/anomaly analysis |
| 12 | lab-order | Domain: Lab Integration | ✅ | 889/889 unit, 48/48 e2e | Order workflow |
| 13 | result-management | Domain: Lab Integration | ✅ | 889/889 unit, 48/48 e2e | Result intake/review/AI interpret |
| 14 | analyzer-interface | Domain: Lab Integration | ✅ | 889/889 unit, 48/48 e2e | Analyzer import/status/sync |
| 15 | quality-control | Domain: Lab Integration | ✅ | 889/889 unit, 48/48 e2e | QC records + stats |

## Governance Review Snapshot (v1)
Source evidence: docs/governance/modules/review_report_v1.txt

| Module | DTO Validation | Swagger Decorators | Service Class | Guard/Permission Decorators |
|---|---|---|---|---|
| rbac | ⚠️ none detected | ⚠️ none detected | ✅ present | ✅ present |
| ai-agent | ⚠️ none detected | ⚠️ none detected | ✅ present | ✅ present |
| plugin-system | ⚠️ none detected | ⚠️ none detected | ✅ present | ✅ present |
| queue | ⚠️ none detected | ⚠️ none detected | ✅ present | ⚠️ none detected |
| webhook-signature | ⚠️ none detected | ⚠️ none detected | ✅ present | ✅ present |
| patient-lifecycle | ✅ present | ⚠️ none detected | ✅ present | ✅ present |
| appointment-intelligence | ✅ present | ⚠️ none detected | ✅ present | ✅ present |
| soap-intelligence | ✅ present | ⚠️ none detected | ✅ present | ✅ present |
| diagnosis-support | ✅ present | ⚠️ none detected | ✅ present | ✅ present |
| order-intelligence | ✅ present | ⚠️ none detected | ✅ present | ✅ present |
| vitals-trending | ✅ present | ⚠️ none detected | ✅ present | ✅ present |
| lab-order | ✅ present | ⚠️ none detected | ✅ present | ✅ present |
| result-management | ✅ present | ⚠️ none detected | ✅ present | ✅ present |
| analyzer-interface | ⚠️ none detected | ⚠️ none detected | ✅ present | ✅ present |
| quality-control | ✅ present | ⚠️ none detected | ✅ present | ✅ present |

## Review Notes
- No module deletions performed.
- No operational module edits performed in this governance pass.
- Main quality gap found: Swagger operation/response decorators are mostly absent across controllers.
- Next change set (separate, governance-approved) should focus on controller API documentation standardization.
