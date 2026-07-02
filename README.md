# ONX Intelligence

> The world's first constitutionally-governed operational intelligence system for veterinary medicine.

## 🏛️ Constitutional Governance

📄 **[MO-039: Constitutional Execution Closure](docs/governance/MO-039_CONSTITUTIONAL_EXECUTION_CLOSURE.md)** — Official project close-out (AAA+ certified).

Every AI decision is constrained by **69 executable constraints** derived from **38 Founder Intent objects**. Every output is evidence-tiered (AC-05). Every mutation is auditable. Every external source enters through a single Perception Bus (HC-12).

### Quick Links

| Document | Location |
|----------|----------|
| MO-039 Closure Report | [`docs/governance/MO-039_CONSTITUTIONAL_EXECUTION_CLOSURE.md`](docs/governance/MO-039_CONSTITUTIONAL_EXECUTION_CLOSURE.md) |
| Governance authority | [`docs/governance/README.md`](docs/governance/README.md) |
| Operations runbook | [`docs/operations/PRODUCTION_OPERATIONS_RUNBOOK.md`](docs/operations/PRODUCTION_OPERATIONS_RUNBOOK.md) |
| Constitutional Content Package (authority) | `onxos/onx-constitutional-assets` *(sealed / out-of-band)* |

## 🚀 Getting Started

```bash
npm install

docker run -d --name onx-postgres \
  -e POSTGRES_USER=onx -e POSTGRES_PASSWORD=onx -e POSTGRES_DB=onx \
  -p 5432:5432 postgres:16

export DATABASE_URL="postgresql://onx:onx@localhost:5432/onx"
npx prisma migrate deploy
npm run start:dev
```

API docs are served at `/api/docs` (Swagger); Prometheus metrics at `/metrics`.

## 📊 Stats

| Metric | Value |
|--------|-------|
| Backend module files | 45 |
| Prisma migrations | 34 |
| Prisma models | 196 |
| Frontend pages | 5 primary (27 routes) |
| Unit tests | **873 / 873 ✅** |
| e2e tests (real DB) | **48 / 48 ✅** |
| Executable constraints | 69 |
| Founder Intent objects | 38 |

## 🏗️ Architecture

```
Frontend (Next.js 16, React 19)
        │  JWT + React Query
        ▼
Backend (NestJS 10 — 45 modules)
        │  SECH gates · FIC enforcement · IURG binding
        ▼
PostgreSQL 16   (Redis-ready; in-memory queue fallback today)
```

**Constitutional data flow:** external source → USFIP Perception Bus → SECH (FIC gates) → IURG graph → evidence-tiered intelligence.

## 🔒 Security & Operations

- Per-endpoint rate limiting, hardened HTTP headers (CSP/HSTS), CORS whitelist.
- JWT auth (24h expiry), bcrypt password hashing, dedicated workspace per user.
- Prometheus metrics, deep health checks (`/monitoring/health`), structured JSON logging.
- IURG disaster-recovery export + `pg_dump` backup schedule (`scripts/backup.sh`).

## 📜 License

Private — All rights reserved.
