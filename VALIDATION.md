# ONX Intelligence - Validation Checklist

## Pre-Push Validation

Every command below MUST pass before any code is pushed to GitHub.

### 1. Install
```bash
npm ci
```
Exit code: 0

### 2. Generate Prisma Client
```bash
npx prisma generate
```
Exit code: 0
Output must contain: "Generated Prisma Client"

### 3. Lint
```bash
npm run lint
```
Exit code: 0
No errors. Warnings are acceptable but should be reviewed.

### 4. Build
```bash
npm run build
```
Exit code: 0
No TypeScript compilation errors.
dist/ directory created with compiled JS.

### 5. Unit Tests
```bash
npm run test
```
Exit code: 0
All tests pass or --passWithNoTests if no test files.

### 6. E2E Tests
```bash
npm run test:e2e
```
Exit code: 0
All e2e tests pass or --passWithNoTests.

### 7. Full CI Pipeline
```bash
npm run ci
```
Exit code: 0
Runs lint + build + test + test:e2e in sequence.

## Architecture Validation

### Checklist
- [ ] `src/common/common.module.ts` is @Global()
- [ ] `src/common/common.module.ts` exports exactly: PrismaService, AuditService
- [ ] No feature module contains `PrismaService` in its `providers` array
- [ ] No feature module contains `AuditService` in its `providers` array
- [ ] `crypto.randomUUID()` is NOT used anywhere in src/
- [ ] `"simulated"` does NOT appear in any src/ file
- [ ] `"mock"` does NOT appear in any src/ file (except test mocks)
- [ ] `server.js` does NOT exist at repository root
- [ ] `dist/` is in .gitignore
- [ ] Exactly 9 module files in src/
- [ ] Feature modules import only: CommonModule, ConfigModule, or other feature modules

### Verify Commands
```bash
grep -r "PrismaService" src/*/module.ts && echo "FAIL: PrismaService in feature module" || echo "PASS"
grep -r "crypto.randomUUID" src/ && echo "FAIL: randomUUID found" || echo "PASS"
grep -ri "simulated" src/ && echo "FAIL: simulated found" || echo "PASS"
grep -ri "mock" src/ --include="*.ts" | grep -v "test/" | grep -v ".spec." && echo "FAIL: mock in source" || echo "PASS"
[ -f server.js ] && echo "FAIL: server.js exists" || echo "PASS"
```

## Post-Deploy Validation (after Render deploy)

### Smoke Tests
```bash
BASE_URL="https://your-render-url.onrender.com" npm run smoke
```

The script lives at [scripts/smoke.sh](scripts/smoke.sh) and exercises health, commit, auth, intelligence, providers, tools, sovereignty, and evidence endpoints.

All 12 checks MUST return HTTP 200/201 with valid JSON.
