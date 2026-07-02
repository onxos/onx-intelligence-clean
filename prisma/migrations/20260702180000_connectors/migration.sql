-- Phase 3 — Connectors
-- Real-world ingestion configs + immutable per-event logs. Additive,
-- workspace-scoped; USFIP record references are plain String (bound by value).

-- CreateTable
CREATE TABLE "connector_configs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "credentials" JSONB,
    "settings" JSONB,
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connector_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_logs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "external_id" TEXT,
    "raw_payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "usfip_record_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connector_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "connector_configs_workspace_id_connector_provider_key" ON "connector_configs"("workspace_id", "connector", "provider");
CREATE INDEX "connector_configs_workspace_id_is_active_idx" ON "connector_configs"("workspace_id", "is_active");
CREATE INDEX "connector_logs_workspace_id_connector_created_at_idx" ON "connector_logs"("workspace_id", "connector", "created_at");
CREATE INDEX "connector_logs_workspace_id_status_idx" ON "connector_logs"("workspace_id", "status");

-- AddForeignKey
ALTER TABLE "connector_configs" ADD CONSTRAINT "connector_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "connector_logs" ADD CONSTRAINT "connector_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
