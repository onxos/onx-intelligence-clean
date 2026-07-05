# ONX Civilization Operating System
## Master Technical Document v0.2.0-alpha

| Metric | Value |
|--------|-------|
| Lines of Code | 106,107 |
| Frontend Pages | 234 |
| API Routers | 395 |
| Database Tables | 560 |
| TypeScript Errors | 0 |
| API Endpoints Tested | 5/5 HTTP 200 |

## Repositories
- onx-deploy (Platform): https://github.com/onxos/onx-deploy
- onx-intelligence-clean (Intelligence): https://github.com/onxos/onx-intelligence-clean

## Technology Stack
Next.js 15 + tRPC v11 + Drizzle ORM + PostgreSQL 16 + Prisma + NestJS + Docker + Redis

## ONX Intelligence Features
- answerFromKnowledge(): Internal KB search FIRST
- ingestKnowledgeAsset(): Every Q+A = wealth
- getSelfSufficiencyMetrics(): Track independence %
- calculateKnowledgeValue(): Value the corpus in USD
- selectOptimalProvider(): Smart AI provider selection
- runConstitutionalAudit(): 7 Principles enforcement

## Constitutional Principles (المبادئ الدستورية)
Amanah, Ihsan, Adl, Rahmah, Hikmah, Itqan, Tawakkul

## AI Agents
- ONX-VA: General assistant
- Medical Advisor: Veterinary diagnosis
- Expansion Analyst: Market expansion
- Constitutional Guardian: Ethics enforcement

## API Endpoints (14 total)
POST /intelligence/answer-from-knowledge
POST /intelligence/ingest-knowledge-asset
GET /intelligence/self-sufficiency-metrics
GET /intelligence/knowledge-value
GET /intelligence/provider-comparison
POST /intelligence/constitutional-audit
+ 8 core endpoints

## Deployment
docker-compose up -d (Postgres + App + Redis)
Port: 3000

ONX Civilization Operating System
The first AI-native OS that accumulates knowledge as civilizational wealth.
