# ONX Legacy Data Migration Plan (EV-P2-08)

## Scope
Migration of legacy clinic data (Elite Vet / Dr. Pawz / VetsVan) into the ONX PostgreSQL core.

## Source → Target Map
| Legacy source | Target table | Method |
|---|---|---|
| Patient records (CSV/Excel export) | vet clinical sessions (vet.createSession) | API replay |
| Drug stock sheets | dom_inventory_items | bulk insert (migrate-legacy.mjs) |
| Client contact lists | dom_crm_contacts | bulk insert |
| Historical invoices | dom_invoices | bulk insert + bi_metrics REVENUE backfill |
| Staff rosters | dom_hr_staff | bulk insert |
| Branch registry | dom_branches | bulk insert with GPS geocoding |
| Clinical knowledge docs | onx_knowledge_corpus | onx_knowledge_ingest.py (SHA-256 idempotent) |

## Phases
1. **Extract**: legacy system exports → /migration/incoming/*.csv
2. **Validate**: schema check + referential integrity (patient→session→lab chains)
3. **Stage**: insert into *_staging tables, diff report
4. **Load**: upsert into production tables (idempotent keys: ticketId/itemCode/contactId/invoiceId)
5. **Verify**: row counts + checksums per table; evidence recorded in evidence_registry
6. **Cutover**: DNS/branch switch per pilot branch (BR-RIY-01 first)

## Rollback
Every load batch tagged with migration_batch id; DELETE ... WHERE migration_batch=:id reverses any phase.

## Invariants (constitutional)
- No patient data leaves KSA region (Amanah)
- Every migrated row carries source provenance (Itqan)
- Dual-run 2 weeks before legacy decommission (Ihsan)
