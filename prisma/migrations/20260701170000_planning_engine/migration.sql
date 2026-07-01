-- Planning Engine (Wave 14)
-- Additive: consumes Reasoning/Knowledge/Measurement/Exchange/Runtime/Objects/
-- Capital/USFIP/IFC/FIAR/FIC by reference (no FK, no duplicated storage).
-- Planning prepares executable strategic plans only — NOT decision, NOT D20.

-- CreateEnum
CREATE TYPE "PlanningMode" AS ENUM ('OPERATIONAL', 'STRATEGIC', 'FOUNDER', 'ADAPTIVE', 'CONSTITUTIONAL', 'SCENARIO', 'RECOVERY', 'OPTIMIZATION');

-- CreateEnum
CREATE TYPE "PlanningSessionStatus" AS ENUM ('PENDING', 'PLANNING', 'COMPLETED', 'FAILED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "PlanningPlanStatus" AS ENUM ('PRIMARY', 'ALTERNATIVE', 'SELECTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PlanningReadiness" AS ENUM ('EXECUTABLE', 'CONDITIONAL', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PlanningRiskLevel" AS ENUM ('LOW', 'MODERATE', 'ELEVATED', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PlanningValidationKind" AS ENUM ('CONSTITUTIONAL', 'RESOURCE', 'DEPENDENCY', 'GOAL', 'RISK', 'CONSISTENCY');

-- CreateTable
CREATE TABLE "planning_sessions" (
    "id" TEXT NOT NULL,
    "planning_session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "mode" "PlanningMode" NOT NULL,
    "objective" TEXT NOT NULL,
    "focus" TEXT,
    "status" "PlanningSessionStatus" NOT NULL DEFAULT 'PENDING',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "readiness" "PlanningReadiness",
    "risk_level" "PlanningRiskLevel",
    "constraints_satisfied" BOOLEAN NOT NULL DEFAULT true,
    "plan_count" INTEGER NOT NULL DEFAULT 0,
    "goal_count" INTEGER NOT NULL DEFAULT 0,
    "constitutional_ref" TEXT,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "planning_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_contexts" (
    "id" TEXT NOT NULL,
    "context_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "runtime" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "role" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "summary" TEXT,
    "payload" JSONB,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_goals" (
    "id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "measurable" BOOLEAN NOT NULL DEFAULT false,
    "decomposed" BOOLEAN NOT NULL DEFAULT false,
    "step_count" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_constraints" (
    "id" TEXT NOT NULL,
    "constraint_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "satisfied" BOOLEAN NOT NULL DEFAULT true,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "category" TEXT,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_constraints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_strategies" (
    "id" TEXT NOT NULL,
    "strategy_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "mode" "PlanningMode" NOT NULL,
    "name" TEXT NOT NULL,
    "rationale" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_plans" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "mode" "PlanningMode" NOT NULL,
    "status" "PlanningPlanStatus" NOT NULL DEFAULT 'PRIMARY',
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "primary" BOOLEAN NOT NULL DEFAULT true,
    "readiness" "PlanningReadiness" NOT NULL DEFAULT 'CONDITIONAL',
    "risk_level" "PlanningRiskLevel" NOT NULL DEFAULT 'MODERATE',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timeline_duration" INTEGER NOT NULL DEFAULT 0,
    "rationale" TEXT,
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_steps" (
    "id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "goal_reference" TEXT,
    "depends_on" JSONB,
    "resource_estimate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duration_estimate" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_milestones" (
    "id" TEXT NOT NULL,
    "milestone_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "criteria" TEXT,
    "target_offset" INTEGER NOT NULL DEFAULT 0,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_evidence" (
    "id" TEXT NOT NULL,
    "evidence_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "runtime" TEXT,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "summary" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "payload" JSONB,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_validations" (
    "id" TEXT NOT NULL,
    "validation_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "valid" BOOLEAN NOT NULL DEFAULT false,
    "kinds" JSONB,
    "issues" JSONB,
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_validations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_history" (
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

    CONSTRAINT "planning_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planning_sessions_planning_session_id_key" ON "planning_sessions"("planning_session_id");
CREATE INDEX "planning_sessions_workspace_id_deleted_at_status_idx" ON "planning_sessions"("workspace_id", "deleted_at", "status");
CREATE INDEX "planning_sessions_workspace_id_mode_idx" ON "planning_sessions"("workspace_id", "mode");
CREATE INDEX "planning_sessions_workspace_id_created_at_idx" ON "planning_sessions"("workspace_id", "created_at");
CREATE INDEX "planning_sessions_planning_session_id_idx" ON "planning_sessions"("planning_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "planning_contexts_context_id_key" ON "planning_contexts"("context_id");
CREATE INDEX "planning_contexts_session_id_created_at_idx" ON "planning_contexts"("session_id", "created_at");
CREATE INDEX "planning_contexts_workspace_id_runtime_idx" ON "planning_contexts"("workspace_id", "runtime");
CREATE INDEX "planning_contexts_context_id_idx" ON "planning_contexts"("context_id");

-- CreateIndex
CREATE UNIQUE INDEX "planning_goals_goal_id_key" ON "planning_goals"("goal_id");
CREATE INDEX "planning_goals_session_id_priority_idx" ON "planning_goals"("session_id", "priority");
CREATE INDEX "planning_goals_workspace_id_created_at_idx" ON "planning_goals"("workspace_id", "created_at");
CREATE INDEX "planning_goals_goal_id_idx" ON "planning_goals"("goal_id");

-- CreateIndex
CREATE UNIQUE INDEX "planning_constraints_constraint_id_key" ON "planning_constraints"("constraint_id");
CREATE INDEX "planning_constraints_session_id_created_at_idx" ON "planning_constraints"("session_id", "created_at");
CREATE INDEX "planning_constraints_workspace_id_satisfied_idx" ON "planning_constraints"("workspace_id", "satisfied");
CREATE INDEX "planning_constraints_constraint_id_idx" ON "planning_constraints"("constraint_id");

-- CreateIndex
CREATE UNIQUE INDEX "planning_strategies_strategy_id_key" ON "planning_strategies"("strategy_id");
CREATE INDEX "planning_strategies_session_id_created_at_idx" ON "planning_strategies"("session_id", "created_at");
CREATE INDEX "planning_strategies_workspace_id_selected_idx" ON "planning_strategies"("workspace_id", "selected");
CREATE INDEX "planning_strategies_strategy_id_idx" ON "planning_strategies"("strategy_id");

-- CreateIndex
CREATE UNIQUE INDEX "planning_plans_plan_id_key" ON "planning_plans"("plan_id");
CREATE INDEX "planning_plans_session_id_sequence_idx" ON "planning_plans"("session_id", "sequence");
CREATE INDEX "planning_plans_workspace_id_status_idx" ON "planning_plans"("workspace_id", "status");
CREATE INDEX "planning_plans_plan_id_idx" ON "planning_plans"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "planning_steps_step_id_key" ON "planning_steps"("step_id");
CREATE INDEX "planning_steps_plan_id_sequence_idx" ON "planning_steps"("plan_id", "sequence");
CREATE INDEX "planning_steps_session_id_created_at_idx" ON "planning_steps"("session_id", "created_at");
CREATE INDEX "planning_steps_step_id_idx" ON "planning_steps"("step_id");

-- CreateIndex
CREATE UNIQUE INDEX "planning_milestones_milestone_id_key" ON "planning_milestones"("milestone_id");
CREATE INDEX "planning_milestones_plan_id_sequence_idx" ON "planning_milestones"("plan_id", "sequence");
CREATE INDEX "planning_milestones_session_id_created_at_idx" ON "planning_milestones"("session_id", "created_at");
CREATE INDEX "planning_milestones_milestone_id_idx" ON "planning_milestones"("milestone_id");

-- CreateIndex
CREATE UNIQUE INDEX "planning_evidence_evidence_id_key" ON "planning_evidence"("evidence_id");
CREATE INDEX "planning_evidence_session_id_created_at_idx" ON "planning_evidence"("session_id", "created_at");
CREATE INDEX "planning_evidence_workspace_id_evidence_type_idx" ON "planning_evidence"("workspace_id", "evidence_type");
CREATE INDEX "planning_evidence_evidence_id_idx" ON "planning_evidence"("evidence_id");

-- CreateIndex
CREATE UNIQUE INDEX "planning_validations_validation_id_key" ON "planning_validations"("validation_id");
CREATE INDEX "planning_validations_session_id_created_at_idx" ON "planning_validations"("session_id", "created_at");
CREATE INDEX "planning_validations_workspace_id_valid_idx" ON "planning_validations"("workspace_id", "valid");
CREATE INDEX "planning_validations_validation_id_idx" ON "planning_validations"("validation_id");

-- CreateIndex
CREATE INDEX "planning_history_session_id_created_at_idx" ON "planning_history"("session_id", "created_at");
CREATE INDEX "planning_history_workspace_id_event_type_idx" ON "planning_history"("workspace_id", "event_type");

-- AddForeignKey
ALTER TABLE "planning_sessions" ADD CONSTRAINT "planning_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_contexts" ADD CONSTRAINT "planning_contexts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "planning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planning_contexts" ADD CONSTRAINT "planning_contexts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_goals" ADD CONSTRAINT "planning_goals_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "planning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planning_goals" ADD CONSTRAINT "planning_goals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_constraints" ADD CONSTRAINT "planning_constraints_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "planning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planning_constraints" ADD CONSTRAINT "planning_constraints_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_strategies" ADD CONSTRAINT "planning_strategies_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "planning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planning_strategies" ADD CONSTRAINT "planning_strategies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_plans" ADD CONSTRAINT "planning_plans_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "planning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planning_plans" ADD CONSTRAINT "planning_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_steps" ADD CONSTRAINT "planning_steps_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planning_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planning_steps" ADD CONSTRAINT "planning_steps_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "planning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planning_steps" ADD CONSTRAINT "planning_steps_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_milestones" ADD CONSTRAINT "planning_milestones_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planning_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planning_milestones" ADD CONSTRAINT "planning_milestones_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "planning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planning_milestones" ADD CONSTRAINT "planning_milestones_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_evidence" ADD CONSTRAINT "planning_evidence_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "planning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planning_evidence" ADD CONSTRAINT "planning_evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_validations" ADD CONSTRAINT "planning_validations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "planning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planning_validations" ADD CONSTRAINT "planning_validations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_history" ADD CONSTRAINT "planning_history_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "planning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planning_history" ADD CONSTRAINT "planning_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
