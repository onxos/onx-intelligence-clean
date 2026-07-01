-- Decision Engine (Wave 15)
-- Additive: consumes Reasoning/Planning/Measurement/Capital/Runtime/Objects/
-- USFIP/IFC/FIAR/FIC by reference (no FK, no duplicated storage).
-- Decision determines the constitutionally valid decision only — it NEVER
-- executes actions (no Execution Engine, no D20, no autonomous execution).

-- CreateEnum
CREATE TYPE "DecisionMode" AS ENUM ('OPERATIONAL', 'STRATEGIC', 'FOUNDER', 'CONSTITUTIONAL', 'EMERGENCY', 'RECOVERY', 'OPTIMIZATION', 'CONSENSUS');

-- CreateEnum
CREATE TYPE "DecisionSessionStatus" AS ENUM ('PENDING', 'EVALUATING', 'DECIDED', 'FAILED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "DecisionCandidateStatus" AS ENUM ('PROPOSED', 'FILTERED', 'EVALUATED', 'SELECTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DecisionVerdictKind" AS ENUM ('SELECTED', 'CONTESTED', 'DEFERRED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "DecisionRiskLevel" AS ENUM ('LOW', 'MODERATE', 'ELEVATED', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DecisionValidationKind" AS ENUM ('CONSTITUTIONAL', 'FOUNDER', 'EVIDENCE', 'REASONING', 'PLANNING', 'CAPITAL');

-- CreateTable
CREATE TABLE "decision_sessions" (
    "id" TEXT NOT NULL,
    "decision_session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "mode" "DecisionMode" NOT NULL,
    "objective" TEXT NOT NULL,
    "focus" TEXT,
    "status" "DecisionSessionStatus" NOT NULL DEFAULT 'PENDING',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "verdict" "DecisionVerdictKind",
    "selected_candidate_id" TEXT,
    "risk_level" "DecisionRiskLevel",
    "constraints_satisfied" BOOLEAN NOT NULL DEFAULT true,
    "candidate_count" INTEGER NOT NULL DEFAULT 0,
    "constitutional_ref" TEXT,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "decision_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_contexts" (
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

    CONSTRAINT "decision_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_candidates" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "status" "DecisionCandidateStatus" NOT NULL DEFAULT 'PROPOSED',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "benefit" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "admissible" BOOLEAN NOT NULL DEFAULT true,
    "reasoning_confidence" DOUBLE PRECISION,
    "planning_readiness" DOUBLE PRECISION,
    "capital_support" DOUBLE PRECISION,
    "constraints_satisfied" BOOLEAN NOT NULL DEFAULT true,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "risk_level" "DecisionRiskLevel",
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decision_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_evaluations" (
    "id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "mode" "DecisionMode" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "benefit_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "risk_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "risk_level" "DecisionRiskLevel" NOT NULL DEFAULT 'MODERATE',
    "constitutional_pass" BOOLEAN NOT NULL DEFAULT true,
    "constraint_pass" BOOLEAN NOT NULL DEFAULT true,
    "rationale" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_constraints" (
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

    CONSTRAINT "decision_constraints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_verdicts" (
    "id" TEXT NOT NULL,
    "verdict_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "mode" "DecisionMode" NOT NULL,
    "kind" "DecisionVerdictKind" NOT NULL,
    "selected_candidate_id" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "risk_level" "DecisionRiskLevel" NOT NULL DEFAULT 'MODERATE',
    "constraints_satisfied" BOOLEAN NOT NULL DEFAULT true,
    "rationale" TEXT,
    "constitutional_ref" TEXT,
    "alternatives" JSONB,
    "trace" JSONB,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_verdicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_evidence" (
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

    CONSTRAINT "decision_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_validations" (
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

    CONSTRAINT "decision_validations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_history" (
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

    CONSTRAINT "decision_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "decision_sessions_decision_session_id_key" ON "decision_sessions"("decision_session_id");
CREATE INDEX "decision_sessions_workspace_id_deleted_at_status_idx" ON "decision_sessions"("workspace_id", "deleted_at", "status");
CREATE INDEX "decision_sessions_workspace_id_mode_idx" ON "decision_sessions"("workspace_id", "mode");
CREATE INDEX "decision_sessions_workspace_id_created_at_idx" ON "decision_sessions"("workspace_id", "created_at");
CREATE INDEX "decision_sessions_decision_session_id_idx" ON "decision_sessions"("decision_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "decision_contexts_context_id_key" ON "decision_contexts"("context_id");
CREATE INDEX "decision_contexts_session_id_created_at_idx" ON "decision_contexts"("session_id", "created_at");
CREATE INDEX "decision_contexts_workspace_id_runtime_idx" ON "decision_contexts"("workspace_id", "runtime");
CREATE INDEX "decision_contexts_context_id_idx" ON "decision_contexts"("context_id");

-- CreateIndex
CREATE UNIQUE INDEX "decision_candidates_candidate_id_key" ON "decision_candidates"("candidate_id");
CREATE INDEX "decision_candidates_session_id_status_idx" ON "decision_candidates"("session_id", "status");
CREATE INDEX "decision_candidates_workspace_id_selected_idx" ON "decision_candidates"("workspace_id", "selected");
CREATE INDEX "decision_candidates_candidate_id_idx" ON "decision_candidates"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "decision_evaluations_evaluation_id_key" ON "decision_evaluations"("evaluation_id");
CREATE INDEX "decision_evaluations_candidate_id_created_at_idx" ON "decision_evaluations"("candidate_id", "created_at");
CREATE INDEX "decision_evaluations_session_id_score_idx" ON "decision_evaluations"("session_id", "score");
CREATE INDEX "decision_evaluations_evaluation_id_idx" ON "decision_evaluations"("evaluation_id");

-- CreateIndex
CREATE UNIQUE INDEX "decision_constraints_constraint_id_key" ON "decision_constraints"("constraint_id");
CREATE INDEX "decision_constraints_session_id_created_at_idx" ON "decision_constraints"("session_id", "created_at");
CREATE INDEX "decision_constraints_workspace_id_satisfied_idx" ON "decision_constraints"("workspace_id", "satisfied");
CREATE INDEX "decision_constraints_constraint_id_idx" ON "decision_constraints"("constraint_id");

-- CreateIndex
CREATE UNIQUE INDEX "decision_verdicts_verdict_id_key" ON "decision_verdicts"("verdict_id");
CREATE INDEX "decision_verdicts_session_id_created_at_idx" ON "decision_verdicts"("session_id", "created_at");
CREATE INDEX "decision_verdicts_workspace_id_kind_idx" ON "decision_verdicts"("workspace_id", "kind");
CREATE INDEX "decision_verdicts_verdict_id_idx" ON "decision_verdicts"("verdict_id");

-- CreateIndex
CREATE UNIQUE INDEX "decision_evidence_evidence_id_key" ON "decision_evidence"("evidence_id");
CREATE INDEX "decision_evidence_session_id_created_at_idx" ON "decision_evidence"("session_id", "created_at");
CREATE INDEX "decision_evidence_workspace_id_evidence_type_idx" ON "decision_evidence"("workspace_id", "evidence_type");
CREATE INDEX "decision_evidence_evidence_id_idx" ON "decision_evidence"("evidence_id");

-- CreateIndex
CREATE UNIQUE INDEX "decision_validations_validation_id_key" ON "decision_validations"("validation_id");
CREATE INDEX "decision_validations_session_id_created_at_idx" ON "decision_validations"("session_id", "created_at");
CREATE INDEX "decision_validations_workspace_id_valid_idx" ON "decision_validations"("workspace_id", "valid");
CREATE INDEX "decision_validations_validation_id_idx" ON "decision_validations"("validation_id");

-- CreateIndex
CREATE INDEX "decision_history_session_id_created_at_idx" ON "decision_history"("session_id", "created_at");
CREATE INDEX "decision_history_workspace_id_event_type_idx" ON "decision_history"("workspace_id", "event_type");

-- AddForeignKey
ALTER TABLE "decision_sessions" ADD CONSTRAINT "decision_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_contexts" ADD CONSTRAINT "decision_contexts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "decision_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision_contexts" ADD CONSTRAINT "decision_contexts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_candidates" ADD CONSTRAINT "decision_candidates_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "decision_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision_candidates" ADD CONSTRAINT "decision_candidates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_evaluations" ADD CONSTRAINT "decision_evaluations_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "decision_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision_evaluations" ADD CONSTRAINT "decision_evaluations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "decision_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision_evaluations" ADD CONSTRAINT "decision_evaluations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_constraints" ADD CONSTRAINT "decision_constraints_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "decision_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision_constraints" ADD CONSTRAINT "decision_constraints_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_verdicts" ADD CONSTRAINT "decision_verdicts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "decision_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision_verdicts" ADD CONSTRAINT "decision_verdicts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_evidence" ADD CONSTRAINT "decision_evidence_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "decision_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision_evidence" ADD CONSTRAINT "decision_evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_validations" ADD CONSTRAINT "decision_validations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "decision_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision_validations" ADD CONSTRAINT "decision_validations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_history" ADD CONSTRAINT "decision_history_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "decision_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decision_history" ADD CONSTRAINT "decision_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
