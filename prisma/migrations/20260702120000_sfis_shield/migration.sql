-- IW-28 SFIS Strategic Founder Intelligence Shield (HC-05, HC-06, HC-11)
-- Guard layer against commodity-AI scope convergence + mandatory Frontier AI
-- availability. SfisModelStatus tracks the 6 frontier engines; SfisScanRecord
-- records every output scan verdict. Additive; workspace-scoped; violations bind
-- to IURG by value (no FK).

-- CreateTable
CREATE TABLE "sfis_model_status" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "last_checked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latency_ms" INTEGER,
    "config_valid" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sfis_model_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sfis_scan_records" (
    "id" TEXT NOT NULL,
    "scan_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "output_type" TEXT NOT NULL,
    "proposed_category" TEXT,
    "verdict" TEXT NOT NULL,
    "detected_category" TEXT,
    "reason" TEXT NOT NULL,
    "matched_patterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "drift_score" DOUBLE PRECISION,
    "output_sample" TEXT,
    "iurg_node_id" TEXT,
    "iurg_node_type" TEXT,
    "trace_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sfis_scan_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sfis_model_status_workspace_id_model_name_key" ON "sfis_model_status"("workspace_id", "model_name");
CREATE INDEX "sfis_model_status_workspace_id_status_idx" ON "sfis_model_status"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sfis_scan_records_scan_id_key" ON "sfis_scan_records"("scan_id");
CREATE INDEX "sfis_scan_records_workspace_id_verdict_idx" ON "sfis_scan_records"("workspace_id", "verdict");
CREATE INDEX "sfis_scan_records_workspace_id_layer_idx" ON "sfis_scan_records"("workspace_id", "layer");
CREATE INDEX "sfis_scan_records_workspace_id_created_at_idx" ON "sfis_scan_records"("workspace_id", "created_at");
CREATE INDEX "sfis_scan_records_scan_id_idx" ON "sfis_scan_records"("scan_id");

-- AddForeignKey
ALTER TABLE "sfis_model_status" ADD CONSTRAINT "sfis_model_status_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sfis_scan_records" ADD CONSTRAINT "sfis_scan_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
