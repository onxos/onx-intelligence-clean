-- D14 Meta-Intelligence Orchestration (Wave 9)
-- Additive: constitutional coordination engine for all Intelligence subsystems.

-- CreateEnum
CREATE TYPE "MetaSessionState" AS ENUM ('OPEN', 'PLANNING', 'EXECUTING', 'MERGING', 'COMPLETED', 'OVERRIDDEN', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MetaPlanStatus" AS ENUM ('DRAFT', 'READY', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "MetaStepStatus" AS ENUM ('PENDING', 'ROUTED', 'RUNNING', 'COMPLETED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "MetaExecutionStatus" AS ENUM ('IDLE', 'RUNNING', 'BLOCKED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "MetaRouteTarget" AS ENUM ('KNOWLEDGE', 'LEARNING', 'RUNTIME', 'EXCHANGE', 'MEASUREMENT', 'CAPITAL', 'INTENT', 'WORKSPACE', 'PROVIDER');

-- CreateEnum
CREATE TYPE "MetaArbitrationType" AS ENUM ('CONFLICT', 'PRIORITY', 'AUTHORITY', 'EVIDENCE', 'CAPITAL', 'EXECUTION');

-- CreateEnum
CREATE TYPE "MetaArbitrationOutcome" AS ENUM ('RESOLVED', 'ESCALATED', 'DEADLOCK');

-- CreateEnum
CREATE TYPE "MetaMergeStatus" AS ENUM ('REQUESTED', 'VALIDATED', 'MERGED', 'REJECTED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "MetaOverrideType" AS ENUM ('MANUAL', 'CONSTITUTIONAL', 'PRIORITY', 'EXECUTION');

-- CreateEnum
CREATE TYPE "MetaPolicyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "meta_orchestration_sessions" (
    "id" TEXT NOT NULL,
    "orchestration_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "state" "MetaSessionState" NOT NULL DEFAULT 'OPEN',
    "objective" TEXT,
    "target_domain" TEXT,
    "plan_seq" INTEGER NOT NULL DEFAULT 0,
    "event_seq" INTEGER NOT NULL DEFAULT 0,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "meta_orchestration_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_execution_plans" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "MetaPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "step_count" INTEGER NOT NULL DEFAULT 0,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "definition" JSONB,
    "actor_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "meta_execution_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_execution_steps" (
    "id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "target" "MetaRouteTarget" NOT NULL,
    "status" "MetaStepStatus" NOT NULL DEFAULT 'PENDING',
    "reference_id" TEXT,
    "reference_type" TEXT,
    "route_reason" TEXT,
    "detail" TEXT,
    "actor_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_execution_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_execution_contexts" (
    "id" TEXT NOT NULL,
    "context_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "context_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "payload" JSONB,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_execution_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_execution_states" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "plan_id" TEXT,
    "workspace_id" TEXT NOT NULL,
    "status" "MetaExecutionStatus" NOT NULL DEFAULT 'IDLE',
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "total_steps" INTEGER NOT NULL DEFAULT 0,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "detail" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_execution_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_execution_history" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "plan_id" TEXT,
    "workspace_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "notes" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_execution_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_execution_evidence" (
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

    CONSTRAINT "meta_execution_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_routing_decisions" (
    "id" TEXT NOT NULL,
    "routing_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "step_id" TEXT,
    "workspace_id" TEXT NOT NULL,
    "target" "MetaRouteTarget" NOT NULL,
    "intent" TEXT,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT,
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_routing_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_arbitrations" (
    "id" TEXT NOT NULL,
    "arbitration_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "type" "MetaArbitrationType" NOT NULL,
    "outcome" "MetaArbitrationOutcome" NOT NULL DEFAULT 'RESOLVED',
    "winning_path" TEXT,
    "losing_paths" JSONB,
    "reason" TEXT,
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_arbitrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_merge_requests" (
    "id" TEXT NOT NULL,
    "merge_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "status" "MetaMergeStatus" NOT NULL DEFAULT 'REQUESTED',
    "source_paths" JSONB,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "validation_detail" TEXT,
    "merged_result" JSONB,
    "rolled_back" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "actor_id" TEXT NOT NULL,
    "merged_at" TIMESTAMP(3),
    "rolled_back_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_merge_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_merge_history" (
    "id" TEXT NOT NULL,
    "merge_ref_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "notes" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_merge_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_override_events" (
    "id" TEXT NOT NULL,
    "override_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "override_type" "MetaOverrideType" NOT NULL,
    "target_reference_id" TEXT,
    "target_reference_type" TEXT,
    "directive" TEXT NOT NULL,
    "reason" TEXT,
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_override_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_routing_policies" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "target" "MetaRouteTarget",
    "status" "MetaPolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "rules" JSONB,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "meta_routing_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_arbitration_policies" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "MetaArbitrationType",
    "status" "MetaPolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "rules" JSONB,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "meta_arbitration_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_merge_policies" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "MetaPolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "rules" JSONB,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "meta_merge_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_execution_policies" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "MetaPolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "rules" JSONB,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "meta_execution_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meta_orchestration_sessions_orchestration_id_key" ON "meta_orchestration_sessions"("orchestration_id");
CREATE INDEX "meta_orchestration_sessions_workspace_id_deleted_at_state_idx" ON "meta_orchestration_sessions"("workspace_id", "deleted_at", "state");
CREATE INDEX "meta_orchestration_sessions_workspace_id_created_at_idx" ON "meta_orchestration_sessions"("workspace_id", "created_at");
CREATE INDEX "meta_orchestration_sessions_orchestration_id_idx" ON "meta_orchestration_sessions"("orchestration_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_execution_plans_plan_id_key" ON "meta_execution_plans"("plan_id");
CREATE INDEX "meta_execution_plans_session_id_created_at_idx" ON "meta_execution_plans"("session_id", "created_at");
CREATE INDEX "meta_execution_plans_workspace_id_status_idx" ON "meta_execution_plans"("workspace_id", "status");
CREATE INDEX "meta_execution_plans_plan_id_idx" ON "meta_execution_plans"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_execution_steps_step_id_key" ON "meta_execution_steps"("step_id");
CREATE INDEX "meta_execution_steps_plan_id_sequence_idx" ON "meta_execution_steps"("plan_id", "sequence");
CREATE INDEX "meta_execution_steps_session_id_created_at_idx" ON "meta_execution_steps"("session_id", "created_at");
CREATE INDEX "meta_execution_steps_workspace_id_status_idx" ON "meta_execution_steps"("workspace_id", "status");
CREATE INDEX "meta_execution_steps_step_id_idx" ON "meta_execution_steps"("step_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_execution_contexts_context_id_key" ON "meta_execution_contexts"("context_id");
CREATE INDEX "meta_execution_contexts_session_id_created_at_idx" ON "meta_execution_contexts"("session_id", "created_at");
CREATE INDEX "meta_execution_contexts_workspace_id_context_type_idx" ON "meta_execution_contexts"("workspace_id", "context_type");

-- CreateIndex
CREATE INDEX "meta_execution_states_session_id_created_at_idx" ON "meta_execution_states"("session_id", "created_at");
CREATE INDEX "meta_execution_states_workspace_id_status_idx" ON "meta_execution_states"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "meta_execution_history_session_id_created_at_idx" ON "meta_execution_history"("session_id", "created_at");
CREATE INDEX "meta_execution_history_workspace_id_event_type_idx" ON "meta_execution_history"("workspace_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "meta_execution_evidence_evidence_id_key" ON "meta_execution_evidence"("evidence_id");
CREATE INDEX "meta_execution_evidence_session_id_created_at_idx" ON "meta_execution_evidence"("session_id", "created_at");
CREATE INDEX "meta_execution_evidence_workspace_id_evidence_type_idx" ON "meta_execution_evidence"("workspace_id", "evidence_type");
CREATE INDEX "meta_execution_evidence_evidence_id_idx" ON "meta_execution_evidence"("evidence_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_routing_decisions_routing_id_key" ON "meta_routing_decisions"("routing_id");
CREATE INDEX "meta_routing_decisions_session_id_created_at_idx" ON "meta_routing_decisions"("session_id", "created_at");
CREATE INDEX "meta_routing_decisions_workspace_id_target_idx" ON "meta_routing_decisions"("workspace_id", "target");
CREATE INDEX "meta_routing_decisions_routing_id_idx" ON "meta_routing_decisions"("routing_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_arbitrations_arbitration_id_key" ON "meta_arbitrations"("arbitration_id");
CREATE INDEX "meta_arbitrations_session_id_created_at_idx" ON "meta_arbitrations"("session_id", "created_at");
CREATE INDEX "meta_arbitrations_workspace_id_type_idx" ON "meta_arbitrations"("workspace_id", "type");
CREATE INDEX "meta_arbitrations_arbitration_id_idx" ON "meta_arbitrations"("arbitration_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_merge_requests_merge_id_key" ON "meta_merge_requests"("merge_id");
CREATE INDEX "meta_merge_requests_session_id_created_at_idx" ON "meta_merge_requests"("session_id", "created_at");
CREATE INDEX "meta_merge_requests_workspace_id_status_idx" ON "meta_merge_requests"("workspace_id", "status");
CREATE INDEX "meta_merge_requests_merge_id_idx" ON "meta_merge_requests"("merge_id");

-- CreateIndex
CREATE INDEX "meta_merge_history_merge_ref_id_created_at_idx" ON "meta_merge_history"("merge_ref_id", "created_at");
CREATE INDEX "meta_merge_history_workspace_id_event_type_idx" ON "meta_merge_history"("workspace_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "meta_override_events_override_id_key" ON "meta_override_events"("override_id");
CREATE INDEX "meta_override_events_session_id_created_at_idx" ON "meta_override_events"("session_id", "created_at");
CREATE INDEX "meta_override_events_workspace_id_override_type_idx" ON "meta_override_events"("workspace_id", "override_type");
CREATE INDEX "meta_override_events_override_id_idx" ON "meta_override_events"("override_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_routing_policies_policy_id_key" ON "meta_routing_policies"("policy_id");
CREATE INDEX "meta_routing_policies_workspace_id_deleted_at_status_idx" ON "meta_routing_policies"("workspace_id", "deleted_at", "status");
CREATE INDEX "meta_routing_policies_policy_id_idx" ON "meta_routing_policies"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_arbitration_policies_policy_id_key" ON "meta_arbitration_policies"("policy_id");
CREATE INDEX "meta_arbitration_policies_workspace_id_deleted_at_status_idx" ON "meta_arbitration_policies"("workspace_id", "deleted_at", "status");
CREATE INDEX "meta_arbitration_policies_policy_id_idx" ON "meta_arbitration_policies"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_merge_policies_policy_id_key" ON "meta_merge_policies"("policy_id");
CREATE INDEX "meta_merge_policies_workspace_id_deleted_at_status_idx" ON "meta_merge_policies"("workspace_id", "deleted_at", "status");
CREATE INDEX "meta_merge_policies_policy_id_idx" ON "meta_merge_policies"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_execution_policies_policy_id_key" ON "meta_execution_policies"("policy_id");
CREATE INDEX "meta_execution_policies_workspace_id_deleted_at_status_idx" ON "meta_execution_policies"("workspace_id", "deleted_at", "status");
CREATE INDEX "meta_execution_policies_policy_id_idx" ON "meta_execution_policies"("policy_id");

-- AddForeignKey
ALTER TABLE "meta_orchestration_sessions" ADD CONSTRAINT "meta_orchestration_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_execution_plans" ADD CONSTRAINT "meta_execution_plans_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "meta_orchestration_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_execution_plans" ADD CONSTRAINT "meta_execution_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_execution_steps" ADD CONSTRAINT "meta_execution_steps_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "meta_execution_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_execution_steps" ADD CONSTRAINT "meta_execution_steps_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "meta_orchestration_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_execution_steps" ADD CONSTRAINT "meta_execution_steps_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_execution_contexts" ADD CONSTRAINT "meta_execution_contexts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "meta_orchestration_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_execution_contexts" ADD CONSTRAINT "meta_execution_contexts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_execution_states" ADD CONSTRAINT "meta_execution_states_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "meta_orchestration_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_execution_states" ADD CONSTRAINT "meta_execution_states_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_execution_history" ADD CONSTRAINT "meta_execution_history_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "meta_orchestration_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_execution_history" ADD CONSTRAINT "meta_execution_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_execution_evidence" ADD CONSTRAINT "meta_execution_evidence_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "meta_orchestration_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_execution_evidence" ADD CONSTRAINT "meta_execution_evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_routing_decisions" ADD CONSTRAINT "meta_routing_decisions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "meta_orchestration_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_routing_decisions" ADD CONSTRAINT "meta_routing_decisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_arbitrations" ADD CONSTRAINT "meta_arbitrations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "meta_orchestration_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_arbitrations" ADD CONSTRAINT "meta_arbitrations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_merge_requests" ADD CONSTRAINT "meta_merge_requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "meta_orchestration_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_merge_requests" ADD CONSTRAINT "meta_merge_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_merge_history" ADD CONSTRAINT "meta_merge_history_merge_ref_id_fkey" FOREIGN KEY ("merge_ref_id") REFERENCES "meta_merge_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_merge_history" ADD CONSTRAINT "meta_merge_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_override_events" ADD CONSTRAINT "meta_override_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "meta_orchestration_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meta_override_events" ADD CONSTRAINT "meta_override_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_routing_policies" ADD CONSTRAINT "meta_routing_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_arbitration_policies" ADD CONSTRAINT "meta_arbitration_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_merge_policies" ADD CONSTRAINT "meta_merge_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_execution_policies" ADD CONSTRAINT "meta_execution_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
