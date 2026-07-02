-- IW-23 FIC Full Runtime Enforcement (SECH-FIC)
-- Additive runtime-enforcement layer for the Founder Intent Compiler.
-- Persists IURG-bound Enforcement + Violation objects produced by the 13-step
-- SECH-FIC check sequence. The constitutional constraint registry itself
-- (68 constraints, 38 intents, 7 conflict classes, 10 playbook mappings) is
-- code-versioned in src/intent-compiler/fic-enforcement.constants.ts and is not
-- stored in the database. No FK to other domains; workspace-scoped only.

-- CreateEnum
CREATE TYPE "FicCheckDecision" AS ENUM ('APPROVED', 'REJECTED', 'CONFLICT', 'OVERRIDE');

-- CreateEnum
CREATE TYPE "FicConstraintKind" AS ENUM ('HC', 'SC', 'AC', 'DG', 'EB', 'OVR', 'OR');

-- CreateEnum
CREATE TYPE "FicEvaluationOutcome" AS ENUM ('PASS', 'VIOLATED', 'FLAGGED', 'GATE_REQUIRED', 'BLOCKED', 'ADVISORY', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "FicViolationKind" AS ENUM ('EXECUTION_BLOCK', 'HARD_CONSTRAINT', 'CONFLICT', 'OVERRIDE');

-- CreateTable
CREATE TABLE "fic_enforcement_checks" (
    "id" TEXT NOT NULL,
    "check_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "check_type" TEXT,
    "decision_context" TEXT,
    "playbooks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signals" JSONB,
    "decision" "FicCheckDecision" NOT NULL,
    "reason" TEXT NOT NULL,
    "applicable_intent_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicable_constraint_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "execution_blocks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hard_violations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "soft_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required_gates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active_overrides" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority_level" INTEGER,
    "requires_human_approval" BOOLEAN NOT NULL DEFAULT false,
    "counter_proposal" TEXT,
    "steps" JSONB NOT NULL,
    "conflicts" JSONB,
    "trace_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fic_enforcement_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fic_constraint_evaluations" (
    "id" TEXT NOT NULL,
    "check_id" TEXT NOT NULL,
    "constraint_id" TEXT NOT NULL,
    "kind" "FicConstraintKind" NOT NULL,
    "title" TEXT NOT NULL,
    "outcome" "FicEvaluationOutcome" NOT NULL,
    "triggered" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fic_constraint_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fic_enforcement_violations" (
    "id" TEXT NOT NULL,
    "violation_id" TEXT NOT NULL,
    "check_id" TEXT NOT NULL,
    "constraint_id" TEXT NOT NULL,
    "kind" "FicViolationKind" NOT NULL,
    "description" TEXT NOT NULL,
    "auto_unblock" TEXT,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fic_enforcement_violations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fic_enforcement_checks_check_id_key" ON "fic_enforcement_checks"("check_id");

-- CreateIndex
CREATE INDEX "fic_enforcement_checks_workspace_id_created_at_idx" ON "fic_enforcement_checks"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "fic_enforcement_checks_workspace_id_decision_idx" ON "fic_enforcement_checks"("workspace_id", "decision");

-- CreateIndex
CREATE INDEX "fic_enforcement_checks_check_id_idx" ON "fic_enforcement_checks"("check_id");

-- CreateIndex
CREATE INDEX "fic_constraint_evaluations_check_id_idx" ON "fic_constraint_evaluations"("check_id");

-- CreateIndex
CREATE INDEX "fic_constraint_evaluations_workspace_id_constraint_id_idx" ON "fic_constraint_evaluations"("workspace_id", "constraint_id");

-- CreateIndex
CREATE UNIQUE INDEX "fic_enforcement_violations_violation_id_key" ON "fic_enforcement_violations"("violation_id");

-- CreateIndex
CREATE INDEX "fic_enforcement_violations_check_id_idx" ON "fic_enforcement_violations"("check_id");

-- CreateIndex
CREATE INDEX "fic_enforcement_violations_workspace_id_kind_idx" ON "fic_enforcement_violations"("workspace_id", "kind");

-- CreateIndex
CREATE INDEX "fic_enforcement_violations_violation_id_idx" ON "fic_enforcement_violations"("violation_id");

-- AddForeignKey
ALTER TABLE "fic_enforcement_checks" ADD CONSTRAINT "fic_enforcement_checks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fic_constraint_evaluations" ADD CONSTRAINT "fic_constraint_evaluations_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "fic_enforcement_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fic_constraint_evaluations" ADD CONSTRAINT "fic_constraint_evaluations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fic_enforcement_violations" ADD CONSTRAINT "fic_enforcement_violations_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "fic_enforcement_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fic_enforcement_violations" ADD CONSTRAINT "fic_enforcement_violations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
