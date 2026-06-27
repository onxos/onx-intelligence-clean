ALTER TABLE "audit_logs" ADD COLUMN "event_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "timestamp" TIMESTAMP(3);
ALTER TABLE "audit_logs" ADD COLUMN "resource_type" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "before" JSONB;
ALTER TABLE "audit_logs" ADD COLUMN "after" JSONB;
ALTER TABLE "audit_logs" ADD COLUMN "request_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "user_agent" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "status" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "success" BOOLEAN;
ALTER TABLE "audit_logs" ADD COLUMN "metadata" JSONB;

UPDATE "audit_logs"
SET
  "event_id" = "id",
  "timestamp" = COALESCE("created_at", CURRENT_TIMESTAMP),
  "resource_type" = "resource",
  "status" = 'SUCCESS',
  "success" = TRUE,
  "metadata" = '{}'::jsonb
WHERE "event_id" IS NULL;

ALTER TABLE "audit_logs" ALTER COLUMN "event_id" SET NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "timestamp" SET NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "resource_type" SET NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "success" SET NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;
ALTER TABLE "audit_logs" ALTER COLUMN "status" SET DEFAULT 'SUCCESS';
ALTER TABLE "audit_logs" ALTER COLUMN "success" SET DEFAULT TRUE;
ALTER TABLE "audit_logs" ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "audit_logs_event_id_key" ON "audit_logs"("event_id");
CREATE INDEX "audit_logs_workspace_id_timestamp_idx" ON "audit_logs"("workspace_id", "timestamp");
CREATE INDEX "audit_logs_actor_id_timestamp_idx" ON "audit_logs"("actor_id", "timestamp");
CREATE INDEX "audit_logs_resource_type_timestamp_idx" ON "audit_logs"("resource_type", "timestamp");
