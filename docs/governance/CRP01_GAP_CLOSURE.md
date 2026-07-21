# CRP-01 — Compliance & Security Gap Closure

> **Stack reconciliation note.** The unified audit gap register was written against a
> NestJS + Prisma reference layout (`src/sech/…`, `src/rbac/rbac.guard.ts`,
> `src/common/guards/webhook-signature.guard.ts`, `prisma/schema.prisma`). This
> repository is a **Hono + tRPC + Drizzle** intelligence service. Each gap below is
> therefore closed against its **real equivalent** in this codebase, preserving the
> _intent_ (fail-closed governance, residency, secret hygiene, RBAC enforcement,
> AI explainability, load targets, structured logging, rotation policy).

| ID | Audit intent | Real equivalent in this repo | Status |
|----|--------------|------------------------------|--------|
| C-1 | SECH governance gate auto-approves everything | `USFIPv2Engine.fullAudit` rubber-stamp + `constitutionalCheck` middleware | Fail-closed SECH gate added (`api/lib/sech-gate.ts`), wired into middleware, deny-by-default |
| C-4 | Data residency inside the Kingdom | `DATA_REGION` env + validation + `render.yaml` + `DEPLOYMENT_GUIDE.md` | Configurable + validated + documented |
| H-5 | Webhook/server secrets fail-closed in prod | `assertProductionSecrets()` at boot (APP_SECRET, bridge secret) + documented webhook vars | Fail-closed secret assertion added |
| H-10 | Dependency vulnerabilities | `npm audit` triage | Audited; safe fixes applied / documented |
| H-7 | AI decision explainability | `ai-brain-router.ask` decision path | Structured AI decision log + model card |
| M-11 | RBAC enforced on protected routes | tRPC `rbacProcedure` guard from shared `api/lib/rbac.ts` | Enforcing middleware + e2e denial tests |
| M-15 | Load tests (k6, p95<500ms, err<1%) | `tests/load/*` | 4 k6 scenarios + runbook + thresholds |
| L-17 | `console.log` in entrypoint | `api/boot.ts` | Replaced with `StructuredLogger` |
| L-18 | 90-day secret rotation policy | `docs/OPERATIONS_RUNBOOK.md` | Rotation policy documented |

See `DEPLOYMENT_GUIDE.md`, `docs/AI_MODEL_CARD.md`, `docs/OPERATIONS_RUNBOOK.md`,
and `tests/load/README.md` for the operator-facing detail behind each row.

## H-10 — Dependency vulnerability triage detail

> **Reconciliation note.** The audit item referenced `@nestjs/cli`, which does not
> exist in this repository's dependency tree (this is not a NestJS project). The
> real dependency tree was audited instead.

`npm audit` on the pre-existing lockfile reported **24 vulnerabilities (23
moderate, 1 high)**. Actions taken:

1. **`brace-expansion` (high, DoS via exponential regex)** — fixed via
   `npm audit fix` (non-breaking, transitive dep of `eslint`).
2. **`esbuild` (moderate, dev-server request/file-read issues)** — the
   top-level direct dependency (`esbuild: ^0.27.2`, resolving to the
   vulnerable `0.27.7`) was bumped to `^0.28.1`, which is outside the
   vulnerable range. Verified via `npm run build` (vite + esbuild bundle)
   still succeeds.
3. **`@opentelemetry/core` (moderate, unbounded memory allocation in W3C
   Baggage propagation, pulled in transitively via `@sentry/node`)** — the
   direct dependency `@sentry/node` was bumped from `^8.30.0` to `^10.67.0`,
   which resolves to a patched `@opentelemetry/core`. `Sentry.init()` usage
   in `api/boot.ts` is a single call with a stable, unchanged API surface
   across this major bump; boot logic and tests were re-verified.

After these three changes, `npm audit` reports **4 remaining moderate
vulnerabilities**, all rooted in `drizzle-kit` (a **devDependency**, used
only for local `db:generate` / `db:migrate` / `db:push` tooling — never
shipped in the production bundle) bundling its own internal, outdated
`@esbuild-kit/esm-loader → esbuild@<=0.24.2`. The only fix path
(`npm audit fix --force`) would **downgrade `drizzle-kit` from `0.31.8` to
`0.18.1`** — 13+ minor versions back, which is a functional regression, not
a safe fix. This residual risk is accepted and documented here; revisit when
`drizzle-kit` ships a release with an updated internal esbuild.
