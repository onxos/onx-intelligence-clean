-- IFC — Institutional Flourishing Capital (Wave 11)
-- Additive: defines how institutional flourishing is represented, measured,
-- accumulated, protected and connected to Intelligence. Reuses
-- D13/D14/D16/D17/D18/D19/FIC/IUC/USFIP by reference (no FK, no duplicated logic).

-- CreateEnum
CREATE TYPE "IFCProfileStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEGRADED', 'OVERRIDDEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IFCDimensionKind" AS ENUM ('KNOWLEDGE', 'EXECUTION', 'GOVERNANCE', 'LEARNING', 'CAPITAL', 'TRUST', 'CONTINUITY', 'FOUNDER_ALIGNMENT');

-- CreateEnum
CREATE TYPE "IFCComponentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DEGRADED');

-- CreateEnum
CREATE TYPE "IFCTrend" AS ENUM ('RISING', 'STABLE', 'FALLING');

-- CreateEnum
CREATE TYPE "IFCRiskLevel" AS ENUM ('LOW', 'MODERATE', 'ELEVATED', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IFCSignalKind" AS ENUM ('CONTRIBUTION', 'PRESERVATION', 'GROWTH', 'DECAY', 'ALLOCATION');

-- CreateTable
CREATE TABLE "ifc_profiles" (
    "id" TEXT NOT NULL,
    "ifc_profile_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "status" "IFCProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "flourishing_index" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trend" "IFCTrend" NOT NULL DEFAULT 'STABLE',
    "risk" "IFCRiskLevel" NOT NULL DEFAULT 'LOW',
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "intent_reference_id" TEXT,
    "objective_reference" TEXT,
    "constitutional_ref" TEXT,
    "score_seq" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ifc_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ifc_dimensions" (
    "id" TEXT NOT NULL,
    "dimension_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" "IFCDimensionKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "IFCComponentStatus" NOT NULL DEFAULT 'ACTIVE',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0.125,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trend" "IFCTrend" NOT NULL DEFAULT 'STABLE',
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ifc_dimensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ifc_indicators" (
    "id" TEXT NOT NULL,
    "indicator_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "dimension_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "IFCComponentStatus" NOT NULL DEFAULT 'ACTIVE',
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ifc_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ifc_scores" (
    "id" TEXT NOT NULL,
    "score_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "flourishing_index" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trend" "IFCTrend" NOT NULL DEFAULT 'STABLE',
    "delta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "risk" "IFCRiskLevel" NOT NULL DEFAULT 'LOW',
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "dimension_scores" JSONB,
    "reason" TEXT,
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ifc_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ifc_signals" (
    "id" TEXT NOT NULL,
    "signal_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" "IFCSignalKind" NOT NULL,
    "magnitude" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "capital_reference" TEXT,
    "reason" TEXT,
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ifc_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ifc_history" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "constitutional_ref" TEXT,
    "notes" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ifc_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ifc_evidence" (
    "id" TEXT NOT NULL,
    "evidence_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "summary" TEXT,
    "payload" JSONB,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ifc_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ifc_policies" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "IFCComponentStatus" NOT NULL DEFAULT 'ACTIVE',
    "min_index" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "min_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "degradation_delta" DOUBLE PRECISION NOT NULL DEFAULT -0.1,
    "constitutional_ref" TEXT,
    "rules" JSONB,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ifc_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ifc_profiles_ifc_profile_id_key" ON "ifc_profiles"("ifc_profile_id");
CREATE INDEX "ifc_profiles_workspace_id_deleted_at_status_idx" ON "ifc_profiles"("workspace_id", "deleted_at", "status");
CREATE INDEX "ifc_profiles_workspace_id_created_at_idx" ON "ifc_profiles"("workspace_id", "created_at");
CREATE INDEX "ifc_profiles_ifc_profile_id_idx" ON "ifc_profiles"("ifc_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "ifc_dimensions_dimension_id_key" ON "ifc_dimensions"("dimension_id");
CREATE UNIQUE INDEX "ifc_dimensions_profile_id_kind_key" ON "ifc_dimensions"("profile_id", "kind");
CREATE INDEX "ifc_dimensions_profile_id_status_idx" ON "ifc_dimensions"("profile_id", "status");
CREATE INDEX "ifc_dimensions_workspace_id_kind_idx" ON "ifc_dimensions"("workspace_id", "kind");
CREATE INDEX "ifc_dimensions_dimension_id_idx" ON "ifc_dimensions"("dimension_id");

-- CreateIndex
CREATE UNIQUE INDEX "ifc_indicators_indicator_id_key" ON "ifc_indicators"("indicator_id");
CREATE INDEX "ifc_indicators_dimension_id_created_at_idx" ON "ifc_indicators"("dimension_id", "created_at");
CREATE INDEX "ifc_indicators_profile_id_status_idx" ON "ifc_indicators"("profile_id", "status");
CREATE INDEX "ifc_indicators_workspace_id_idx" ON "ifc_indicators"("workspace_id");
CREATE INDEX "ifc_indicators_indicator_id_idx" ON "ifc_indicators"("indicator_id");

-- CreateIndex
CREATE UNIQUE INDEX "ifc_scores_score_id_key" ON "ifc_scores"("score_id");
CREATE INDEX "ifc_scores_profile_id_created_at_idx" ON "ifc_scores"("profile_id", "created_at");
CREATE INDEX "ifc_scores_workspace_id_created_at_idx" ON "ifc_scores"("workspace_id", "created_at");
CREATE INDEX "ifc_scores_score_id_idx" ON "ifc_scores"("score_id");

-- CreateIndex
CREATE UNIQUE INDEX "ifc_signals_signal_id_key" ON "ifc_signals"("signal_id");
CREATE INDEX "ifc_signals_profile_id_created_at_idx" ON "ifc_signals"("profile_id", "created_at");
CREATE INDEX "ifc_signals_workspace_id_kind_idx" ON "ifc_signals"("workspace_id", "kind");
CREATE INDEX "ifc_signals_signal_id_idx" ON "ifc_signals"("signal_id");

-- CreateIndex
CREATE INDEX "ifc_history_profile_id_created_at_idx" ON "ifc_history"("profile_id", "created_at");
CREATE INDEX "ifc_history_workspace_id_event_type_idx" ON "ifc_history"("workspace_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "ifc_evidence_evidence_id_key" ON "ifc_evidence"("evidence_id");
CREATE INDEX "ifc_evidence_profile_id_created_at_idx" ON "ifc_evidence"("profile_id", "created_at");
CREATE INDEX "ifc_evidence_workspace_id_evidence_type_idx" ON "ifc_evidence"("workspace_id", "evidence_type");
CREATE INDEX "ifc_evidence_evidence_id_idx" ON "ifc_evidence"("evidence_id");

-- CreateIndex
CREATE UNIQUE INDEX "ifc_policies_policy_id_key" ON "ifc_policies"("policy_id");
CREATE INDEX "ifc_policies_workspace_id_status_idx" ON "ifc_policies"("workspace_id", "status");
CREATE INDEX "ifc_policies_policy_id_idx" ON "ifc_policies"("policy_id");

-- AddForeignKey
ALTER TABLE "ifc_profiles" ADD CONSTRAINT "ifc_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ifc_dimensions" ADD CONSTRAINT "ifc_dimensions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "ifc_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ifc_dimensions" ADD CONSTRAINT "ifc_dimensions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ifc_indicators" ADD CONSTRAINT "ifc_indicators_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "ifc_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ifc_indicators" ADD CONSTRAINT "ifc_indicators_dimension_id_fkey" FOREIGN KEY ("dimension_id") REFERENCES "ifc_dimensions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ifc_indicators" ADD CONSTRAINT "ifc_indicators_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ifc_scores" ADD CONSTRAINT "ifc_scores_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "ifc_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ifc_scores" ADD CONSTRAINT "ifc_scores_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ifc_signals" ADD CONSTRAINT "ifc_signals_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "ifc_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ifc_signals" ADD CONSTRAINT "ifc_signals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ifc_history" ADD CONSTRAINT "ifc_history_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "ifc_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ifc_history" ADD CONSTRAINT "ifc_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ifc_evidence" ADD CONSTRAINT "ifc_evidence_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "ifc_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ifc_evidence" ADD CONSTRAINT "ifc_evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ifc_policies" ADD CONSTRAINT "ifc_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
