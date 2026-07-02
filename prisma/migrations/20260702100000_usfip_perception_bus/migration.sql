-- IW-26 USFIP Unified Perception Bus (HC-12, AC-05)
-- Single entry gate for all perception data. Each record is validated /
-- classified / ranked (AC-05 evidence tier) / FIC-checked (via SECH pre_judgment)
-- and routed into IURG. Distinct from the IW-14 USFIP strategic protocol.
-- Additive; workspace-scoped; links to FIC/SECH/IURG by value (no FK).

-- CreateTable
CREATE TABLE "usfip_perception_records" (
    "id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "raw_payload" JSONB NOT NULL,
    "classified_domain" TEXT NOT NULL,
    "evidence_tier" INTEGER NOT NULL,
    "evidence_score" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "fic_check_id" TEXT,
    "sech_route_id" TEXT,
    "iurg_node_id" TEXT,
    "iurg_node_type" TEXT,
    "trace_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usfip_perception_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usfip_perception_records_record_id_key" ON "usfip_perception_records"("record_id");
CREATE INDEX "usfip_perception_records_workspace_id_source_type_idx" ON "usfip_perception_records"("workspace_id", "source_type");
CREATE INDEX "usfip_perception_records_workspace_id_evidence_tier_idx" ON "usfip_perception_records"("workspace_id", "evidence_tier");
CREATE INDEX "usfip_perception_records_workspace_id_status_idx" ON "usfip_perception_records"("workspace_id", "status");
CREATE INDEX "usfip_perception_records_workspace_id_classified_domain_idx" ON "usfip_perception_records"("workspace_id", "classified_domain");
CREATE INDEX "usfip_perception_records_record_id_idx" ON "usfip_perception_records"("record_id");

-- AddForeignKey
ALTER TABLE "usfip_perception_records" ADD CONSTRAINT "usfip_perception_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
