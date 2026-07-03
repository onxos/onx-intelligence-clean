# Capability Alignment

| Blueprint Domain | Systems | Modules Built | Gap Analysis |
|-----------------|---------|--------------|--------------|
| Clinical | 6 | 6/6 | ✅ Complete |
| Lab Integration | 4 | 4/4 | ✅ Complete |
| Financial Operations | 4 | 0/4 | ❌ Not Started |
| Intelligence Overlay | 4 | Partial | ⚠️ In Progress |
| Governance and Compliance | N/A | Partial | ⚠️ In Progress |
| Security and Runtime Hardening | N/A | Partial | ⚠️ In Progress |

## Clinical Mapping (6/6)
- patient-lifecycle
- appointment-intelligence
- soap-intelligence
- diagnosis-support
- order-intelligence
- vitals-trending

## Lab Integration Mapping (4/4)
- lab-order
- result-management
- analyzer-interface
- quality-control

## Governance Evidence
- Full audit grep output: docs/governance/modules/review_report_v1.txt
- Governance policy baseline: docs/governance/ONX_GOVERNANCE_METHODOLOGY_v1.md
- Registry and compliance snapshot: docs/governance/MODULE_REGISTRY.md

## Constraints Applied In This Pass
- No file/module deletion.
- No new functional module introduced beyond already approved scope.
- Governance-only artifacts added.
