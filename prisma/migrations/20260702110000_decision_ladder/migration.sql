-- IW-27 D14 Decision Ladder (HC-10)
-- The 14-step process (D1-D14) across 5 stages that transforms perception into
-- an institutional rule. Extends the Decision module additively. Reuses SECH for
-- the D8 pre_decision + D14 post_outcome FIC checks. Workspace-scoped; links to
-- USFIP/FIC/SECH by value (no FK).

-- CreateEnum
CREATE TYPE "DecisionLadderStage" AS ENUM ('PERCEPTION', 'UNDERSTANDING', 'JUDGMENT', 'LEARNING', 'GROWTH');

-- CreateEnum
CREATE TYPE "DecisionRunStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED', 'PROMOTED');

-- CreateTable
CREATE TABLE "decision_runs" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "perception_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "current_step" TEXT NOT NULL,
    "current_stage" "DecisionLadderStage" NOT NULL,
    "status" "DecisionRunStatus" NOT NULL DEFAULT 'ACTIVE',
    "step_history" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "human_gate_required" BOOLEAN NOT NULL DEFAULT false,
    "human_gate_type" TEXT,
    "human_gate_approver" TEXT,
    "human_gate_resolved_at" TIMESTAMP(3),
    "iteration_count" INTEGER NOT NULL DEFAULT 0,
    "final_decision" TEXT,
    "outcome_validated" BOOLEAN NOT NULL DEFAULT false,
    "promoted_to_rule" BOOLEAN NOT NULL DEFAULT false,
    "rule_id" TEXT,
    "fic_check_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sech_route_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signals" JSONB,
    "trace_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decision_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "decision_runs_run_id_key" ON "decision_runs"("run_id");
CREATE INDEX "decision_runs_workspace_id_status_idx" ON "decision_runs"("workspace_id", "status");
CREATE INDEX "decision_runs_workspace_id_current_step_idx" ON "decision_runs"("workspace_id", "current_step");
CREATE INDEX "decision_runs_workspace_id_perception_id_idx" ON "decision_runs"("workspace_id", "perception_id");
CREATE INDEX "decision_runs_run_id_idx" ON "decision_runs"("run_id");

-- AddForeignKey
ALTER TABLE "decision_runs" ADD CONSTRAINT "decision_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
