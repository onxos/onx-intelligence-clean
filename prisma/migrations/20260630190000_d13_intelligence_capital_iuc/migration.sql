-- IW-07 — D13 Intelligence Capital, D13.5 Capital Allocation, IUC Foundation
-- Additive only. Build-only on the existing Capital Allocation Engine.
-- No destructive modification of prior tables. Backward compatible.

-- AlterEnum (additive enum values for execution / rollback lifecycle)
ALTER TYPE "AllocationStatus" ADD VALUE IF NOT EXISTS 'EXECUTED';
ALTER TYPE "AllocationStatus" ADD VALUE IF NOT EXISTS 'ROLLED_BACK';

-- CreateEnum
CREATE TYPE "IntelligenceCapitalCategory" AS ENUM ('KNOWLEDGE', 'EVIDENCE', 'EXECUTION', 'TRUST', 'LEARNING', 'DECISION', 'FOUNDER');

-- CreateEnum
CREATE TYPE "IntelligenceCapitalStatus" AS ENUM ('ACTIVE', 'PRESERVED', 'DECAYING', 'DEPLETED', 'RECOVERING', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CapitalAccumulationType" AS ENUM ('CREATION', 'GROWTH', 'REDUCTION', 'PRESERVATION', 'COMPOUNDING', 'DECAY', 'RECOVERY', 'ALLOCATION', 'ROLLBACK');

-- CreateEnum
CREATE TYPE "UnderstandingStateType" AS ENUM ('NASCENT', 'FORMING', 'DEVELOPING', 'ESTABLISHED', 'INSTITUTIONALIZED', 'EVOLVING', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "UnderstandingEventType" AS ENUM ('STATE_TRANSITION', 'PROGRESS_UPDATE', 'EVIDENCE_LINKED', 'CONFIDENCE_UPDATE', 'EVOLUTION');

-- CreateEnum
CREATE TYPE "UnderstandingRelationType" AS ENUM ('DEPENDS_ON', 'SUPPORTS', 'REFINES', 'CONTRADICTS', 'DERIVES_FROM', 'GOVERNS', 'COMPOSES');

-- AlterTable (additive nullable columns for allocation execution / rollback)
ALTER TABLE "capital_allocations" ADD COLUMN "capital_id" TEXT;
ALTER TABLE "capital_allocations" ADD COLUMN "executed_at" TIMESTAMP(3);
ALTER TABLE "capital_allocations" ADD COLUMN "executed_by" TEXT;
ALTER TABLE "capital_allocations" ADD COLUMN "rolled_back_at" TIMESTAMP(3);
ALTER TABLE "capital_allocations" ADD COLUMN "rolled_back_by" TEXT;

-- CreateTable
CREATE TABLE "intelligence_capital" (
    "id" TEXT NOT NULL,
    "capital_id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "description" TEXT,
    "category" "IntelligenceCapitalCategory" NOT NULL,
    "owner_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "current_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accumulated_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allocated_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minimum_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "growth_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "preservation_score" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "risk_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "source_lineage" TEXT[],
    "authority" "AuthorityLevel" NOT NULL DEFAULT 'OPERATIONAL',
    "status" "IntelligenceCapitalStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" TEXT NOT NULL DEFAULT 'IUC',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "intelligence_capital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capital_accumulation_events" (
    "id" TEXT NOT NULL,
    "capital_id" TEXT NOT NULL,
    "event_type" "CapitalAccumulationType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "value_before" DOUBLE PRECISION NOT NULL,
    "value_after" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capital_accumulation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iuc_entities" (
    "id" TEXT NOT NULL,
    "iuc_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "domain" TEXT,
    "owner_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "state" "UnderstandingStateType" NOT NULL DEFAULT 'NASCENT',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "authority" "AuthorityLevel" NOT NULL DEFAULT 'OPERATIONAL',
    "capital_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "iuc_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "understanding_events" (
    "id" TEXT NOT NULL,
    "iuc_id" TEXT NOT NULL,
    "event_type" "UnderstandingEventType" NOT NULL,
    "from_state" "UnderstandingStateType",
    "to_state" "UnderstandingStateType",
    "progress_before" DOUBLE PRECISION,
    "progress_after" DOUBLE PRECISION,
    "confidence_before" DOUBLE PRECISION,
    "confidence_after" DOUBLE PRECISION,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "understanding_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "understanding_evidence" (
    "id" TEXT NOT NULL,
    "iuc_id" TEXT NOT NULL,
    "evidence_record_id" TEXT,
    "object_id" TEXT,
    "description" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "understanding_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "understanding_relationships" (
    "id" TEXT NOT NULL,
    "source_iuc_id" TEXT NOT NULL,
    "target_iuc_id" TEXT NOT NULL,
    "relation_type" "UnderstandingRelationType" NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "workspace_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "understanding_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intelligence_capital_capital_id_key" ON "intelligence_capital"("capital_id");

-- CreateIndex
CREATE INDEX "intelligence_capital_workspace_id_deleted_at_status_idx" ON "intelligence_capital"("workspace_id", "deleted_at", "status");

-- CreateIndex
CREATE INDEX "intelligence_capital_workspace_id_category_created_at_idx" ON "intelligence_capital"("workspace_id", "category", "created_at");

-- CreateIndex
CREATE INDEX "intelligence_capital_capital_id_idx" ON "intelligence_capital"("capital_id");

-- CreateIndex
CREATE INDEX "capital_accumulation_events_capital_id_created_at_idx" ON "capital_accumulation_events"("capital_id", "created_at");

-- CreateIndex
CREATE INDEX "capital_accumulation_events_workspace_id_event_type_created__idx" ON "capital_accumulation_events"("workspace_id", "event_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "iuc_entities_iuc_id_key" ON "iuc_entities"("iuc_id");

-- CreateIndex
CREATE INDEX "iuc_entities_workspace_id_deleted_at_state_idx" ON "iuc_entities"("workspace_id", "deleted_at", "state");

-- CreateIndex
CREATE INDEX "iuc_entities_workspace_id_domain_created_at_idx" ON "iuc_entities"("workspace_id", "domain", "created_at");

-- CreateIndex
CREATE INDEX "iuc_entities_iuc_id_idx" ON "iuc_entities"("iuc_id");

-- CreateIndex
CREATE INDEX "understanding_events_iuc_id_created_at_idx" ON "understanding_events"("iuc_id", "created_at");

-- CreateIndex
CREATE INDEX "understanding_events_workspace_id_event_type_created_at_idx" ON "understanding_events"("workspace_id", "event_type", "created_at");

-- CreateIndex
CREATE INDEX "understanding_evidence_iuc_id_deleted_at_created_at_idx" ON "understanding_evidence"("iuc_id", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "understanding_evidence_workspace_id_created_at_idx" ON "understanding_evidence"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "understanding_relationships_src_tgt_type_key" ON "understanding_relationships"("source_iuc_id", "target_iuc_id", "relation_type");

-- CreateIndex
CREATE INDEX "understanding_relationships_workspace_id_deleted_at_relation_idx" ON "understanding_relationships"("workspace_id", "deleted_at", "relation_type");

-- CreateIndex
CREATE INDEX "understanding_relationships_target_iuc_id_idx" ON "understanding_relationships"("target_iuc_id");

-- CreateIndex
CREATE INDEX "capital_allocations_capital_id_idx" ON "capital_allocations"("capital_id");

-- AddForeignKey
ALTER TABLE "capital_allocations" ADD CONSTRAINT "capital_allocations_capital_id_fkey" FOREIGN KEY ("capital_id") REFERENCES "intelligence_capital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_capital" ADD CONSTRAINT "intelligence_capital_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_accumulation_events" ADD CONSTRAINT "capital_accumulation_events_capital_id_fkey" FOREIGN KEY ("capital_id") REFERENCES "intelligence_capital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_accumulation_events" ADD CONSTRAINT "capital_accumulation_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iuc_entities" ADD CONSTRAINT "iuc_entities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iuc_entities" ADD CONSTRAINT "iuc_entities_capital_id_fkey" FOREIGN KEY ("capital_id") REFERENCES "intelligence_capital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "understanding_events" ADD CONSTRAINT "understanding_events_iuc_id_fkey" FOREIGN KEY ("iuc_id") REFERENCES "iuc_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "understanding_events" ADD CONSTRAINT "understanding_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "understanding_evidence" ADD CONSTRAINT "understanding_evidence_iuc_id_fkey" FOREIGN KEY ("iuc_id") REFERENCES "iuc_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "understanding_evidence" ADD CONSTRAINT "understanding_evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "understanding_relationships" ADD CONSTRAINT "understanding_relationships_source_iuc_id_fkey" FOREIGN KEY ("source_iuc_id") REFERENCES "iuc_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "understanding_relationships" ADD CONSTRAINT "understanding_relationships_target_iuc_id_fkey" FOREIGN KEY ("target_iuc_id") REFERENCES "iuc_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "understanding_relationships" ADD CONSTRAINT "understanding_relationships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
