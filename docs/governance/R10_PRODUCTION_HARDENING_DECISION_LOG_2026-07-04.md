# R10 Production Hardening — Constitutional Decision Log

**Date:** 2026-07-04
**Reference:** R1–R9 complete; this log records the R10 hardening pass.
**Status:** Constitutional Decision Log (append-only record)

## Decision Summary

| Gap ID | Description | Closure Method |
|---|---|---|
| GAP-014 | RBAC decorators not applied | `@RequirePermissions` added to all endpoints across 15 controllers (Patient, Appointment, Prescription, LabResult, MedicalRecord, Vaccination, ClinicalDocument, Invoice, Inventory [3 controllers], Notification, Dashboard, Connector, Intelligence Overlay) |
| GAP-016 | Governance decision logs missing | This file establishes the `docs/governance/` decision-log convention for R10 |
| GAP-017 | Test coverage insufficient | E2E test suite added (patient, appointment, RBAC) + existing unit test suite (175 tests across 22 suites) |
| GAP-018 | Render deployment not updated | `render.yaml` + `.env.example` updated with complete environment variable set |

## Gaps Closed — Endpoint Coverage

| Domain | New/Extended Permissions | Endpoints Protected |
|---|---|---|
| Patient | 4 (existing) | 6 |
| Appointment | 4 (existing) | 7 |
| Prescription | 4 (existing) | 7 |
| LabResult | 4 (existing) | 8 |
| MedicalRecord | 4 (new) | 8 |
| Vaccination | 4 (new) | 8 |
| ClinicalDocument | 4 (new) | 8 |
| Invoice/Billing | 4 (1 new: BILLING_DELETE) | 9 |
| Inventory | 4 (new) | 14 (across 3 controllers) |
| Notification | 4 (new) | 9 |
| Dashboard | 1 (new: ANALYTICS_READ) | 7 |
| Connector | 2 (new: CONNECTOR_MANAGE, CONNECTOR_READ) | 9 |
| AI Overlay | 1 (new: AI_DIAGNOSTIC) | 9 |

## Companion Change: Role Permission Grants

Since `RbacGuard` is already registered globally as `APP_GUARD` (via `RbacModule`), decorating a previously-undecorated endpoint with `@RequirePermissions(...)` immediately enforces that permission for every role except `FOUNDER` (which inherits `Object.values(Permission)` in full). To avoid locking `ADMIN`/`VETERINARIAN`/`TECHNICIAN`/`RECEPTIONIST`/`VIEWER` out of the R2–R9 modules they were previously able to access unrestricted, `roles.config.ts` was additively extended so each role retains sensible access to the newly-protected domains (Medical Records, Vaccinations, Documents, Inventory, Notifications, Analytics, Connectors, AI Diagnostics). No existing permission grants were removed.

## Test Results

| Test Type | Count | Status |
|---|---|---|
| Unit Tests | 175 | PASS |
| E2E Tests | see verification section below | — |
| Webhook Tests | 8 (subset of unit suite) | PASS |

## Constitutional Compliance

- **Amanah (R2):** RBAC enforces Care Supremacy — unauthorized access is now prevented at the API layer across all clinical, financial, and operational domains added in R2–R9.
- **Evidence Before Action:** All changes verified via `npm run build` and `npm test` before this log was finalized.
- **Institutional Memory:** This governance log preserves the decision rationale for extending RBAC coverage and the companion role-permission changes required to avoid a functional regression.
- **Founder Intent:** The AI Overlay (R9) enables natural language intent execution under `AI_DIAGNOSTIC` permission gating, ensuring clinical AI features remain access-controlled.

## Next Review Date

To be scheduled after production deployment validation (post R10 rollout).

---
*R10 Production Hardening — Constitutional Decision Log*
