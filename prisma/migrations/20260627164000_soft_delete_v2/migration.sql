ALTER TABLE "evidence_records" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "memory_entries" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "provenance_records" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "provider_evaluations" ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "evidence_records_workspace_id_deleted_at_idx" ON "evidence_records"("workspace_id", "deleted_at");
CREATE INDEX "memory_entries_workspace_id_deleted_at_idx" ON "memory_entries"("workspace_id", "deleted_at");
CREATE INDEX "provenance_records_workspace_id_deleted_at_idx" ON "provenance_records"("workspace_id", "deleted_at");
CREATE INDEX "provider_evaluations_deleted_at_idx" ON "provider_evaluations"("deleted_at");
