# ONX Intelligence - Failure Policy

## Core Principle

If CI fails, the response is NOT a hotfix. It is a root-cause fix.

## Policy Rules

### 1. No Manual Hotfix Loops

When CI fails:
- STOP. Do not guess.
- Read the CI log. Identify the exact file and line.
- Fix the source code at the root cause.
- Push the fix.
- Wait for CI to run again.
- Repeat until CI passes.

### 2. No Duplicate Services

If a service already exists in `src/common/`, it must NOT be recreated in any feature module.

| Service | Canonical Location |
|---------|-------------------|
| PrismaService | `src/common/prisma.service.ts` |
| AuditService | `src/common/audit.service.ts` |

Violation: Any `.service.ts` file outside `src/common/` that defines `PrismaService` or `AuditService`.

### 3. No Provider Repetition

Feature modules must NEVER include `PrismaService` or `AuditService` in their `providers` array.

Correct pattern:
```typescript
@Module({
  imports: [CommonModule],  // or rely on @Global()
  controllers: [MyController],
  providers: [MyService],    // ONLY MyService
})
```

Violation: `providers: [PrismaService, MyService]` or `providers: [AuditService, MyService]`.

### 4. No Dist Commit Unless Source Build Passes

The `dist/` directory must NEVER be committed manually.

If CI is configured to commit dist/:
- The commit-dist step MUST depend on the validate job passing.
- The commit MUST use `[skip ci]` to prevent infinite loops.
- If the validate job fails, commit-dist MUST NOT run.

### 5. No Simulated Endpoints

Any response that does not query the database is a simulated endpoint.

Violations include:
- Hardcoded JSON objects
- `Math.random()` for fake data
- Static strings like `"status": "simulated"`
- `crypto.randomUUID()` for IDs (use Prisma @default(cuid()))

### 6. CI Failure Response Protocol

```
CI FAILS
    |
    v
Read exact error (file:line)
    |
    v
Identify root cause
    |
    v
Fix in source code ONLY
    |
    v
Push fix
    |
    v
Wait for CI re-run
    |
    v
PASS? ---> Deploy to Render
FAIL?  ---> Repeat from top
```

### 7. Forbidden Patterns

| Pattern | Location | Why Forbidden |
|---------|----------|---------------|
| `PrismaService` in feature module providers | Any `*.module.ts` except `common.module.ts` | Duplicate provider registration |
| `crypto.randomUUID()` | Any `*.service.ts` | Use Prisma `@default(cuid())` |
| `"simulated"` in response | Any `*.ts` | Real data only |
| `server.js` fallback | Repository root | Masks real errors with fake responses |
| `dist/` committed | Any branch | Build artifacts should not be in git |
| `npm run lint -- --fix` in CI | `.github/workflows/*.yml` | Modifies files silently |

### 8. Allowed Patterns

| Pattern | Location | Why Correct |
|---------|----------|-------------|
| `imports: [CommonModule]` | Feature `*.module.ts` | Gets PrismaService + AuditService via @Global() |
| `@default(cuid())` in schema | `prisma/schema.prisma` | Database handles ID generation |
| `private readonly prisma: PrismaService` | Constructor injection | Depends on global provider |
| `await this.prisma.$queryRaw` | Health check | Real database connectivity test |

## Enforcement

This policy is enforced by:
1. GitHub Actions CI pipeline
2. Architecture validation scripts in VALIDATION.md
3. Manual smoke tests after every deploy
