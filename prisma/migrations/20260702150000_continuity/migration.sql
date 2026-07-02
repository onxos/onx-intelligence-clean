-- IW-31 Continuity (HC-04 no destructive updates + HC-03 evidence tiers)
-- Append-only enforcement layer. ContinuityAudit is the immutable trail of every
-- CREATE/REVISE/SUPERSEDE/DEPRECATE (and BLOCKED_UPDATE/BLOCKED_DELETE) on
-- protected intelligence. Additive; workspace-scoped; target refs plain String.

-- CreateEnum
CREATE TYPE "ContinuityOperationType" AS ENUM ('CREATE', 'REVISE', 'SUPERSEDE', 'DEPRECATE', 'BLOCKED_UPDATE', 'BLOCKED_DELETE');

-- CreateTable
CREATE TABLE "continuity_audits" (
    "id" TEXT NOT NULL,
    "audit_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "operation" "ContinuityOperationType" NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "previous_value" JSONB,
    "new_value" JSONB,
    "reason" TEXT NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "block_reason" TEXT,
    "related_dg" TEXT,
    "tier_from" TEXT,
    "tier_to" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "iurg_node_id" TEXT,
    "trace_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "continuity_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "continuity_audits_audit_id_key" ON "continuity_audits"("audit_id");
CREATE INDEX "continuity_audits_workspace_id_target_type_idx" ON "continuity_audits"("workspace_id", "target_type");
CREATE INDEX "continuity_audits_workspace_id_operation_idx" ON "continuity_audits"("workspace_id", "operation");
CREATE INDEX "continuity_audits_workspace_id_created_at_idx" ON "continuity_audits"("workspace_id", "created_at");
CREATE INDEX "continuity_audits_workspace_id_target_type_target_id_idx" ON "continuity_audits"("workspace_id", "target_type", "target_id");
CREATE INDEX "continuity_audits_audit_id_idx" ON "continuity_audits"("audit_id");

-- AddForeignKey
ALTER TABLE "continuity_audits" ADD CONSTRAINT "continuity_audits_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
