# Intelligence Service — Coverage Matrix

## Reflection Rules
| Rule | Name | Event Types | Insight | Tests | Status |
|------|------|-------------|---------|-------|--------|
| 1 | completed-cycle | payroll.run.* | insight-cycle-* | ✅ | COMPLETE |
| 2 | recurrence | any (pattern detection) | insight-pattern-* | ✅ | COMPLETE |
| 3 | coverage | any (domain count) | insight-coverage | ✅ | COMPLETE |
| 4 | verdict-awareness | ack-* | insight-verdicts | ✅ | COMPLETE |
| 5 | revenue-pulse | billing.invoice.created, finance.payment.received | insight-revenue-pulse | ✅ | COMPLETE |
| 6 | no-show-anomaly | crm.appointment.noshow, crm.appointment.completed | insight-anomaly-noshow | ✅ | COMPLETE |
| 7 | overdue-invoices | billing.invoice.overdue | insight-overdue-invoices | ✅ | COMPLETE |

## Actionable Insights (actionType)
| Insight Type | Action Type | Platform Handler | Status |
|--------------|-------------|-----------------|--------|
| insight-overdue-invoices | overdue_invoice_followup | decision-execute.ts | ✅ COMPLETE |
| insight-revenue-pulse | (informational) | — | INTENTIONAL |
| insight-anomaly-noshow | (informational) | — | INTENTIONAL |
| insight-cycle-* | (informational) | — | INTENTIONAL |
| insight-pattern-* | (informational) | — | INTENTIONAL |
| insight-coverage | (informational) | — | INTENTIONAL |
| insight-verdicts | (meta-loop) | — | INTENTIONAL |

## tRPC Procedures
| Router | Procedure | Status |
|--------|-----------|--------|
| health | live, ready, status, metrics, ping, bridge, platformEvents, perceptionAdapter, persistence, reflection, insightsPublic | ✅ COMPLETE |
| titan | listInsights, verdicts | ✅ COMPLETE |
| bridge | (platform events endpoint) | ✅ COMPLETE |

## Frontend Routes
| Path | Component | Status |
|------|-----------|--------|
| / | Landing | ✅ COMPLETE |
| /dashboard | Dashboard | ✅ COMPLETE |
| /titan-conclave/pulse | TitanPulse | ✅ COMPLETE |
| /revenue | Revenue | ✅ COMPLETE |
| /ask | Ask | ✅ COMPLETE |
| ... (15 total) | All pages | ✅ ALL COMPLETE |

## Environment Variables
| Variable | Required | Default | Purpose |
|----------|----------|---------|----------|
| APP_ID | ✅ | — | Application identifier |
| APP_SECRET | ✅ | — | Application secret |
| BRIDGE_ENABLED | No | false | Enable platform bridge |
| BRIDGE_SHARED_SECRET | If bridge | — | Bridge auth (min 32 chars) |
| DATABASE_URL | No | sqlite:///app/db/onx-pilot.db | Database connection |
| KIMI_AUTH_URL | No | https://auth.kimi.com | Kimi AI provider |
| KIMI_OPEN_URL | No | https://open.kimi.com | Kimi AI provider |
| OWNER_UNION_ID | No | '' | Kimi owner ID |
| OPENAI_API_KEY | No | '' | OpenAI provider |
| NODE_ENV | No | development | Environment |

## Gaps (Documented Intentional)
| Gap | Reason | Action |
|-----|--------|--------|
| Email/SMS channels | No external provider key | Documented in founder keys table; mail service in platform |
| Only 1/7 insights actionable | Others are informational monitoring | Intentional design; more actions = future feature |
