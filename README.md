# ONX Intelligence v1.0

**Civilization-Scale Intelligence Operating System**

ONX Intelligence is the first AI operating system built on Islamic constitutional principles — featuring 5 AI Titans, 18 intelligence engines, 50 specialized skills, and autonomous execution rhythms.

---

## Quick Start

```bash
npm install
npm run build
npm start
```

## Architecture (6 Layers)

```
L5: Pilot + Launch          Deployment, certification, monitoring
L4: Autonomy                Consciousness Scheduler, 6 Civilizational Programs
L3: Domain Skills           19 Domains, 50 Skills, Veterinary Intelligence
L2: Knowledge               25K records, 5 Titan KBs, vector search
L1: Foundation Skills       Constitution, Auth, AI Brain, Titan Bridge
L0: Civilization Substrate  18 Engines, USFIPv2, Guardian, Continuity
```

## Key Features

| Feature | Count |
|---------|-------|
| tRPC Routers | 30 |
| API Endpoints | 230+ |
| Intelligence Engines | 18 |
| AI Providers | 5 (GPT-4o, Claude, Qwen, GLM-5, Gemini) |
| Titan Personas | 5 (Prometheus, Athena, Zeus, Hermes, Apollo) |
| Specialized Skills | 50 (Marketing, Content, Intelligence, Cloud, Personal) |
| Knowledge Domains | 19 |
| Knowledge Records | 22,500 وحدة قالبية مولّدة (Demo) — الكوربوس الأصيل قيد الاسترداد (STE-REC-06)؛ القياس في docs/CORPUS_GAP_REPORT.md |
| Constitutional Principles | 7 (Amanah, Ihsan, Adl, Rahmah, Hikmah, Itqan, Tawakkul) |
| Civilizational Programs | 6 (CEP, OCPP, CEVP, CCOP, COS, UCR) |
| Consciousness Rhythms | 5 (Pulse, Breath, Digest, Dream, Renew) |

## 7 Constitutional Principles

1. **Amanah** (الأمانة) — Trustworthiness
2. **Ihsan** (الإحسان) — Excellence
3. **Adl** (العدل) — Justice
4. **Rahmah** (الرحمة) — Compassion
5. **Hikmah** (الحكمة) — Wisdom
6. **Itqan** (الاتقان) — Mastery
7. **Tawakkul** (التوكل) — Trust in Divine

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/dashboard` | Original dashboard |
| `/v2` | Command center with real-time stats |
| `/ask` | Titan Bridge chat interface |
| `/login` | Authentication |

## API Endpoints

### Core Routers

- `auth.*` — Authentication (login, register, me)
- `authHardening.*` — RBAC v2, rate limiting, audit
- `passwordReset.*` — Password reset, 2FA, sessions, API keys
- `health.*` — Health checks, metrics, readiness

### Intelligence Routers

- `titan.*` — 5 AI Titans with GPT-4o
- `titanBridge.*` / `bridge.*` — Platform-to-Intelligence bridge contract
- `corpusQuery.*` — Secure corpus bridge (`status`, `domains`, `search`)
- `intentEngine.*` — Secure intent bridge (`status`, `governance`, `analyze`)
- `modelFederation.*` — 5 AI providers with fallback
- `runtime.*` — 18 intelligence engines
- `aiBrain.*` — 5-layer memory system

> Bridge endpoints (`titan.consult`, `corpusQuery.*`, `intentEngine.*`) require `BRIDGE_ENABLED=true` and header `x-onx-bridge-key` matching `BRIDGE_SHARED_SECRET`.

### Knowledge Routers

- `knowledge.*` — 25K records, vector search
- `titanKb.*` — 5 specialized knowledge bases
- `skills.*` — 50 specialized skills

### Domain Routers

- `vet.*` — Veterinary intelligence
- `institutional.*` — Multi-tenant institutions

### Civilizational Programs

- `cep.*` — Civilizational Economics
- `ocpp.*` — Prosperity Program
- `cevp.*` — Evolution Program
- `ccop.*` — Continuity Program
- `cos.*` — Civilizational OS
- `ucr.*` — Unified Constitutional Runtime

### Governance

- `constitution.*` — 7 principles validation
- `scheduler.*` — 5 consciousness rhythms

## Environment Variables

```env
DATABASE_URL=sqlite:///app.db
OPENAI_API_KEY=sk-...
OWNER_UNION_ID=...
JWT_SECRET=your-secret-key
APP_URL=http://localhost:3000
BRIDGE_ENABLED=false
BRIDGE_SHARED_SECRET=your-long-random-shared-secret
```

## Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Hono.js, tRPC, Drizzle ORM
- **AI**: OpenAI SDK (GPT-4o), Model Federation
- **Database**: SQLite (MySQL/PostgreSQL ready)
- **Build**: Vite (frontend), esbuild (backend)

## License

UNLICENSED — Proprietary to ONX Intelligence

---

*"We are not just building software. We are building a civilization."*
