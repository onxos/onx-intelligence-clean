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
BASE="https://your-render-url.onrender.com"

# 1. Health
curl -s "$BASE/health" | jq '{status: .status, has_info: (.info != null)}'

# 2. Commit
curl -s "$BASE/commit" | jq '{commit: .commit, nodeEnv: .nodeEnv}'

# 3. Register
curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" \
  -d '{"email":"test@onx.io","password":"TestPass123!","name":"Test"}' | jq '.token'

# 4. Login
curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"test@onx.io","password":"TestPass123!"}' | jq '.token'

# 5. Me (with JWT)
curl -s "$BASE/auth/me" -H "Authorization: Bearer $JWT" | jq '{id, email, name}'

# 6. POST /intelligence
curl -s -X POST "$BASE/intelligence" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"TestIO","content":"test","objectType":"PATTERN"}' | jq '{id, name}'

# 7. GET /intelligence
curl -s "$BASE/intelligence" -H "Authorization: Bearer $JWT" | jq 'length'

# 8. GET /providers
curl -s "$BASE/providers" -H "Authorization: Bearer $JWT" | jq 'length'

# 9. GET /tools
curl -s "$BASE/tools" -H "Authorization: Bearer $JWT" | jq 'length'

# 10. POST /sovereignty/evaluate
curl -s -X POST "$BASE/sovereignty/evaluate" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -d '{"intent":"test"}' | jq '.recommendation'

# 11. GET /evidence
curl -s "$BASE/evidence" -H "Authorization: Bearer $JWT" | jq 'length'

# 12. POST /evidence
curl -s -X POST "$BASE/evidence" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -d '{"intent":"test"}' | jq '{id, intent}'
```

All 12 tests MUST return HTTP 200/201 with valid JSON.
