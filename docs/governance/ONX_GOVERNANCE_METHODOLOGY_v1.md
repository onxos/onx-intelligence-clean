# ONX Intelligence Governance Methodology v1.0

## 1. اساس الحوكمة
- المرجع: ONX Intelligence Clean Capability Blueprint
- Framework: Constitution 7-Layer (L0-L6)
- Objective: الجودة فوق السرعة

## 2. قبل كل module جديد:
- [ ] Capability Reference: اي system/من الـ Blueprint؟
- [ ] Intent Alignment: هل الـ module يخدم Founder Intent؟
- [ ] Constraint Check: هل يخالف اي constraint دستوري؟
- [ ] Evidence Log: لماذا تم اتخاذ كل قرار تقني؟
- [ ] Quality Gate: build + tests + lint كلها خضراء؟

## 3. اثناء البناء:
- [ ] Prisma models: تتبع naming convention المشروع
- [ ] Controllers: RESTful + documented
- [ ] Services: single responsibility + testable
- [ ] DTOs: validation decorators + typed
- [ ] Events: emit lifecycle events
- [ ] RBAC: permissions assigned

## 4. قبل الـ Commit:
- [ ] Build: 0 errors
- [ ] Tests: >= 95% passing
- [ ] Lint: 0 errors
- [ ] Documentation: inline comments
- [ ] Audit trail: every decision logged

## 5. بعد الـ Commit:
- [ ] Render deploy: health check 200
- [ ] API docs: Swagger updated
- [ ] Frontend: wired if applicable
- [ ] Governance: intent logged

## 6. Governance Enforcement Policy (Added)
- No deletion of existing files/modules without explicit founder approval.
- No new module creation without governance review record in docs/governance.
- Allowed without extra approval: bug fixes, quality improvements, governance layer additions.
- Every delivery must include a governance evidence artifact under docs/governance/modules/.
