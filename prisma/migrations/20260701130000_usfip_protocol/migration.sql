-- USFIP — Universal Strategic Founder Intelligence Protocol (Wave 10)
-- Additive: constitutional protocol governing how Founder intent becomes
-- strategic intelligence. Reuses FIC/D14/D16/D17/D18/D19/IUC by reference.

-- CreateEnum
CREATE TYPE "USFIPSessionState" AS ENUM ('OPEN', 'INTERPRETING', 'EXECUTING', 'COMPLETED', 'OVERRIDDEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "USFIPProtocolStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "USFIPComponentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "USFIPExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "StrategicPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "StrategicHorizon" AS ENUM ('IMMEDIATE', 'SHORT', 'MEDIUM', 'LONG');

-- CreateTable
CREATE TABLE "usfip_sessions" (
    "id" TEXT NOT NULL,
    "usfip_session_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "state" "USFIPSessionState" NOT NULL DEFAULT 'OPEN',
    "founder_directive" TEXT,
    "strategic_objective" TEXT,
    "strategic_context" TEXT,
    "strategic_constraints" JSONB,
    "strategic_priority" "StrategicPriority" NOT NULL DEFAULT 'MEDIUM',
    "strategic_horizon" "StrategicHorizon" NOT NULL DEFAULT 'MEDIUM',
    "strategic_outcome" TEXT,
    "intent_reference_id" TEXT,
    "intent_reference_type" TEXT,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "execution_seq" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "usfip_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usfip_protocols" (
    "id" TEXT NOT NULL,
    "protocol_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "USFIPProtocolStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "strategic_priority" "StrategicPriority" NOT NULL DEFAULT 'MEDIUM',
    "strategic_horizon" "StrategicHorizon" NOT NULL DEFAULT 'MEDIUM',
    "constitutional_ref" TEXT,
    "definition" JSONB,
    "actor_id" TEXT NOT NULL,
    "activated_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "usfip_protocols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usfip_rules" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "protocol_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "USFIPComponentStatus" NOT NULL DEFAULT 'ACTIVE',
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "condition" TEXT,
    "action" TEXT,
    "constitutional_ref" TEXT,
    "definition" JSONB,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "usfip_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usfip_policies" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "protocol_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "USFIPComponentStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "strategic_priority" "StrategicPriority" NOT NULL DEFAULT 'MEDIUM',
    "constitutional_ref" TEXT,
    "rules" JSONB,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "usfip_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usfip_executions" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "protocol_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "status" "USFIPExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "selected_policy_id" TEXT,
    "selected_rule_ids" JSONB,
    "execution_path" JSONB,
    "strategic_priority" "StrategicPriority" NOT NULL DEFAULT 'MEDIUM',
    "strategic_horizon" "StrategicHorizon" NOT NULL DEFAULT 'MEDIUM',
    "outcome" TEXT,
    "reason" TEXT,
    "constitutional_ref" TEXT,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actor_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usfip_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usfip_history" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "constitutional_ref" TEXT,
    "notes" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usfip_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usfip_evidence" (
    "id" TEXT NOT NULL,
    "evidence_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "summary" TEXT,
    "payload" JSONB,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usfip_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usfip_sessions_usfip_session_id_key" ON "usfip_sessions"("usfip_session_id");
CREATE INDEX "usfip_sessions_workspace_id_deleted_at_state_idx" ON "usfip_sessions"("workspace_id", "deleted_at", "state");
CREATE INDEX "usfip_sessions_workspace_id_created_at_idx" ON "usfip_sessions"("workspace_id", "created_at");
CREATE INDEX "usfip_sessions_usfip_session_id_idx" ON "usfip_sessions"("usfip_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "usfip_protocols_protocol_id_key" ON "usfip_protocols"("protocol_id");
CREATE INDEX "usfip_protocols_session_id_created_at_idx" ON "usfip_protocols"("session_id", "created_at");
CREATE INDEX "usfip_protocols_workspace_id_status_idx" ON "usfip_protocols"("workspace_id", "status");
CREATE INDEX "usfip_protocols_protocol_id_idx" ON "usfip_protocols"("protocol_id");

-- CreateIndex
CREATE UNIQUE INDEX "usfip_rules_rule_id_key" ON "usfip_rules"("rule_id");
CREATE INDEX "usfip_rules_protocol_id_ordering_idx" ON "usfip_rules"("protocol_id", "ordering");
CREATE INDEX "usfip_rules_workspace_id_status_idx" ON "usfip_rules"("workspace_id", "status");
CREATE INDEX "usfip_rules_rule_id_idx" ON "usfip_rules"("rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "usfip_policies_policy_id_key" ON "usfip_policies"("policy_id");
CREATE INDEX "usfip_policies_protocol_id_priority_idx" ON "usfip_policies"("protocol_id", "priority");
CREATE INDEX "usfip_policies_workspace_id_status_idx" ON "usfip_policies"("workspace_id", "status");
CREATE INDEX "usfip_policies_policy_id_idx" ON "usfip_policies"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "usfip_executions_execution_id_key" ON "usfip_executions"("execution_id");
CREATE INDEX "usfip_executions_session_id_created_at_idx" ON "usfip_executions"("session_id", "created_at");
CREATE INDEX "usfip_executions_protocol_id_created_at_idx" ON "usfip_executions"("protocol_id", "created_at");
CREATE INDEX "usfip_executions_workspace_id_status_idx" ON "usfip_executions"("workspace_id", "status");
CREATE INDEX "usfip_executions_execution_id_idx" ON "usfip_executions"("execution_id");

-- CreateIndex
CREATE INDEX "usfip_history_session_id_created_at_idx" ON "usfip_history"("session_id", "created_at");
CREATE INDEX "usfip_history_workspace_id_event_type_idx" ON "usfip_history"("workspace_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "usfip_evidence_evidence_id_key" ON "usfip_evidence"("evidence_id");
CREATE INDEX "usfip_evidence_session_id_created_at_idx" ON "usfip_evidence"("session_id", "created_at");
CREATE INDEX "usfip_evidence_workspace_id_evidence_type_idx" ON "usfip_evidence"("workspace_id", "evidence_type");
CREATE INDEX "usfip_evidence_evidence_id_idx" ON "usfip_evidence"("evidence_id");

-- AddForeignKey
ALTER TABLE "usfip_sessions" ADD CONSTRAINT "usfip_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usfip_protocols" ADD CONSTRAINT "usfip_protocols_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "usfip_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usfip_protocols" ADD CONSTRAINT "usfip_protocols_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usfip_rules" ADD CONSTRAINT "usfip_rules_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "usfip_protocols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usfip_rules" ADD CONSTRAINT "usfip_rules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usfip_policies" ADD CONSTRAINT "usfip_policies_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "usfip_protocols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usfip_policies" ADD CONSTRAINT "usfip_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usfip_executions" ADD CONSTRAINT "usfip_executions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "usfip_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usfip_executions" ADD CONSTRAINT "usfip_executions_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "usfip_protocols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usfip_executions" ADD CONSTRAINT "usfip_executions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usfip_history" ADD CONSTRAINT "usfip_history_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "usfip_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usfip_history" ADD CONSTRAINT "usfip_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usfip_evidence" ADD CONSTRAINT "usfip_evidence_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "usfip_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usfip_evidence" ADD CONSTRAINT "usfip_evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
