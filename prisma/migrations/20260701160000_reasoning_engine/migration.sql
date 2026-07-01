-- Reasoning Engine (Wave 13)
-- Additive: consumes Objects/Knowledge/Learning/Measurement/Exchange/Meta/USFIP/
-- IFC/FIAR/FIC by reference (no FK, no duplicated storage).
-- NOT planning, NOT decision.

-- CreateEnum
CREATE TYPE "ReasoningMode" AS ENUM ('DEDUCTIVE', 'INDUCTIVE', 'ABDUCTIVE', 'ANALOGICAL', 'CONSTRAINT', 'STRATEGIC', 'CONSTITUTIONAL', 'FOUNDER_GUIDED');

-- CreateEnum
CREATE TYPE "ReasoningSessionStatus" AS ENUM ('PENDING', 'REASONING', 'COMPLETED', 'FAILED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "ReasoningChainStatus" AS ENUM ('PRIMARY', 'ALTERNATIVE', 'SELECTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReasoningStepKind" AS ENUM ('CONTEXT_LOADING', 'CHAIN_CONSTRUCTION', 'EVIDENCE_AGGREGATION', 'CONSTRAINT_EVALUATION', 'CONFIDENCE_SCORING', 'ALTERNATIVE_PATHS', 'REASONING_TRACE');

-- CreateEnum
CREATE TYPE "ReasoningVerdict" AS ENUM ('CONCLUSIVE', 'PLAUSIBLE', 'INCONCLUSIVE', 'CONTESTED');

-- CreateEnum
CREATE TYPE "ReasoningValidationKind" AS ENUM ('CONSTITUTIONAL', 'TRUST', 'EVIDENCE', 'KNOWLEDGE', 'CONSISTENCY');

-- CreateTable
CREATE TABLE "reasoning_sessions" (
    "id" TEXT NOT NULL,
    "reasoning_session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "mode" "ReasoningMode" NOT NULL,
    "question" TEXT NOT NULL,
    "objective" TEXT,
    "status" "ReasoningSessionStatus" NOT NULL DEFAULT 'PENDING',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "verdict" "ReasoningVerdict",
    "constraints_satisfied" BOOLEAN NOT NULL DEFAULT true,
    "alternatives_count" INTEGER NOT NULL DEFAULT 0,
    "constitutional_ref" TEXT,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reasoning_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reasoning_contexts" (
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

    CONSTRAINT "reasoning_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reasoning_chains" (
    "id" TEXT NOT NULL,
    "chain_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "mode" "ReasoningMode" NOT NULL,
    "status" "ReasoningChainStatus" NOT NULL DEFAULT 'PRIMARY',
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "primary" BOOLEAN NOT NULL DEFAULT true,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rationale" TEXT,
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reasoning_chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reasoning_steps" (
    "id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "chain_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" "ReasoningStepKind" NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "input" JSONB,
    "output" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reasoning_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reasoning_results" (
    "id" TEXT NOT NULL,
    "result_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "verdict" "ReasoningVerdict" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conclusion" TEXT NOT NULL,
    "constraints_satisfied" BOOLEAN NOT NULL DEFAULT true,
    "alternatives_count" INTEGER NOT NULL DEFAULT 0,
    "constitutional_ref" TEXT,
    "payload" JSONB,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reasoning_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reasoning_evidence" (
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

    CONSTRAINT "reasoning_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reasoning_validations" (
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

    CONSTRAINT "reasoning_validations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reasoning_history" (
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

    CONSTRAINT "reasoning_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reasoning_sessions_reasoning_session_id_key" ON "reasoning_sessions"("reasoning_session_id");
CREATE INDEX "reasoning_sessions_workspace_id_deleted_at_status_idx" ON "reasoning_sessions"("workspace_id", "deleted_at", "status");
CREATE INDEX "reasoning_sessions_workspace_id_mode_idx" ON "reasoning_sessions"("workspace_id", "mode");
CREATE INDEX "reasoning_sessions_workspace_id_created_at_idx" ON "reasoning_sessions"("workspace_id", "created_at");
CREATE INDEX "reasoning_sessions_reasoning_session_id_idx" ON "reasoning_sessions"("reasoning_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "reasoning_contexts_context_id_key" ON "reasoning_contexts"("context_id");
CREATE INDEX "reasoning_contexts_session_id_created_at_idx" ON "reasoning_contexts"("session_id", "created_at");
CREATE INDEX "reasoning_contexts_workspace_id_runtime_idx" ON "reasoning_contexts"("workspace_id", "runtime");
CREATE INDEX "reasoning_contexts_context_id_idx" ON "reasoning_contexts"("context_id");

-- CreateIndex
CREATE UNIQUE INDEX "reasoning_chains_chain_id_key" ON "reasoning_chains"("chain_id");
CREATE INDEX "reasoning_chains_session_id_sequence_idx" ON "reasoning_chains"("session_id", "sequence");
CREATE INDEX "reasoning_chains_workspace_id_status_idx" ON "reasoning_chains"("workspace_id", "status");
CREATE INDEX "reasoning_chains_chain_id_idx" ON "reasoning_chains"("chain_id");

-- CreateIndex
CREATE UNIQUE INDEX "reasoning_steps_step_id_key" ON "reasoning_steps"("step_id");
CREATE INDEX "reasoning_steps_chain_id_sequence_idx" ON "reasoning_steps"("chain_id", "sequence");
CREATE INDEX "reasoning_steps_session_id_kind_idx" ON "reasoning_steps"("session_id", "kind");
CREATE INDEX "reasoning_steps_step_id_idx" ON "reasoning_steps"("step_id");

-- CreateIndex
CREATE UNIQUE INDEX "reasoning_results_result_id_key" ON "reasoning_results"("result_id");
CREATE INDEX "reasoning_results_session_id_created_at_idx" ON "reasoning_results"("session_id", "created_at");
CREATE INDEX "reasoning_results_workspace_id_verdict_idx" ON "reasoning_results"("workspace_id", "verdict");
CREATE INDEX "reasoning_results_result_id_idx" ON "reasoning_results"("result_id");

-- CreateIndex
CREATE UNIQUE INDEX "reasoning_evidence_evidence_id_key" ON "reasoning_evidence"("evidence_id");
CREATE INDEX "reasoning_evidence_session_id_created_at_idx" ON "reasoning_evidence"("session_id", "created_at");
CREATE INDEX "reasoning_evidence_workspace_id_evidence_type_idx" ON "reasoning_evidence"("workspace_id", "evidence_type");
CREATE INDEX "reasoning_evidence_evidence_id_idx" ON "reasoning_evidence"("evidence_id");

-- CreateIndex
CREATE UNIQUE INDEX "reasoning_validations_validation_id_key" ON "reasoning_validations"("validation_id");
CREATE INDEX "reasoning_validations_session_id_created_at_idx" ON "reasoning_validations"("session_id", "created_at");
CREATE INDEX "reasoning_validations_workspace_id_valid_idx" ON "reasoning_validations"("workspace_id", "valid");
CREATE INDEX "reasoning_validations_validation_id_idx" ON "reasoning_validations"("validation_id");

-- CreateIndex
CREATE INDEX "reasoning_history_session_id_created_at_idx" ON "reasoning_history"("session_id", "created_at");
CREATE INDEX "reasoning_history_workspace_id_event_type_idx" ON "reasoning_history"("workspace_id", "event_type");

-- AddForeignKey
ALTER TABLE "reasoning_sessions" ADD CONSTRAINT "reasoning_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reasoning_contexts" ADD CONSTRAINT "reasoning_contexts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "reasoning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reasoning_contexts" ADD CONSTRAINT "reasoning_contexts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reasoning_chains" ADD CONSTRAINT "reasoning_chains_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "reasoning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reasoning_chains" ADD CONSTRAINT "reasoning_chains_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reasoning_steps" ADD CONSTRAINT "reasoning_steps_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "reasoning_chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reasoning_steps" ADD CONSTRAINT "reasoning_steps_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "reasoning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reasoning_steps" ADD CONSTRAINT "reasoning_steps_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reasoning_results" ADD CONSTRAINT "reasoning_results_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "reasoning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reasoning_results" ADD CONSTRAINT "reasoning_results_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reasoning_evidence" ADD CONSTRAINT "reasoning_evidence_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "reasoning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reasoning_evidence" ADD CONSTRAINT "reasoning_evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reasoning_validations" ADD CONSTRAINT "reasoning_validations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "reasoning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reasoning_validations" ADD CONSTRAINT "reasoning_validations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reasoning_history" ADD CONSTRAINT "reasoning_history_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "reasoning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reasoning_history" ADD CONSTRAINT "reasoning_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
