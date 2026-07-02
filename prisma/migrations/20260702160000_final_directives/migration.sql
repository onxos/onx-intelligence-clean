-- IW-32 Final Directive Modules (Constitution Volume III)
-- D15 Self-Assessment | D17 Cross-Module Audit | D18 Exception Handling |
-- D20 Systemic Health Monitor. Additive; workspace-scoped; refs plain String.

-- CreateTable
CREATE TABLE "self_assessments" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "target_module" TEXT,
    "intent_alignment" DOUBLE PRECISION NOT NULL,
    "constraint_score" DOUBLE PRECISION NOT NULL,
    "gap_count" INTEGER NOT NULL,
    "gaps" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "verdict" TEXT NOT NULL,
    "fic_check_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "self_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cross_module_audits" (
    "id" TEXT NOT NULL,
    "audit_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "module_count" INTEGER NOT NULL,
    "modules_checked" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inconsistencies" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "verdict" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cross_module_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "override_executions" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "override_rule" TEXT NOT NULL,
    "handler_type" TEXT NOT NULL,
    "triggered_by" TEXT NOT NULL,
    "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "reverted_by" TEXT,
    "reverted_at" TIMESTAMP(3),
    "iurg_node_id" TEXT,
    "trace_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "override_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_health" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "last_check" TIMESTAMP(3) NOT NULL,
    "response_ms" INTEGER,
    "error_rate" DOUBLE PRECISION,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_health_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "self_assessments_assessment_id_key" ON "self_assessments"("assessment_id");
CREATE INDEX "self_assessments_workspace_id_verdict_idx" ON "self_assessments"("workspace_id", "verdict");
CREATE INDEX "self_assessments_workspace_id_created_at_idx" ON "self_assessments"("workspace_id", "created_at");
CREATE INDEX "self_assessments_assessment_id_idx" ON "self_assessments"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "cross_module_audits_audit_id_key" ON "cross_module_audits"("audit_id");
CREATE INDEX "cross_module_audits_workspace_id_verdict_idx" ON "cross_module_audits"("workspace_id", "verdict");
CREATE INDEX "cross_module_audits_workspace_id_created_at_idx" ON "cross_module_audits"("workspace_id", "created_at");
CREATE INDEX "cross_module_audits_audit_id_idx" ON "cross_module_audits"("audit_id");

-- CreateIndex
CREATE UNIQUE INDEX "override_executions_execution_id_key" ON "override_executions"("execution_id");
CREATE INDEX "override_executions_workspace_id_status_idx" ON "override_executions"("workspace_id", "status");
CREATE INDEX "override_executions_workspace_id_override_rule_idx" ON "override_executions"("workspace_id", "override_rule");
CREATE INDEX "override_executions_execution_id_idx" ON "override_executions"("execution_id");

-- CreateIndex
CREATE INDEX "system_health_workspace_id_system_idx" ON "system_health"("workspace_id", "system");
CREATE INDEX "system_health_workspace_id_created_at_idx" ON "system_health"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "self_assessments" ADD CONSTRAINT "self_assessments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cross_module_audits" ADD CONSTRAINT "cross_module_audits_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "override_executions" ADD CONSTRAINT "override_executions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "system_health" ADD CONSTRAINT "system_health_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
