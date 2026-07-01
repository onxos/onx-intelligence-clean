-- IW-08 — D17 Intelligence Measurement Architecture
-- Additive only. Build-only on D11/D12/D13/D16/FIC/IUC.
-- No destructive modification of prior tables. Backward compatible.

-- CreateEnum
CREATE TYPE "MeasurementIndexType" AS ENUM ('UQI', 'JQI', 'WQI', 'ICI', 'OQI', 'IRS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MeasurementProgressState" AS ENUM ('NASCENT', 'GROWTH', 'IMPROVEMENT', 'PLATEAU', 'REGRESSION', 'STABLE', 'COMPLETION');

-- CreateEnum
CREATE TYPE "MeasurementTrend" AS ENUM ('UNKNOWN', 'RISING', 'FALLING', 'STABLE', 'VOLATILE');

-- CreateEnum
CREATE TYPE "MeasurementFeedbackType" AS ENUM ('MEASUREMENT_UPDATE', 'LEARNING_FEEDBACK', 'CAPITAL_FEEDBACK', 'KNOWLEDGE_FEEDBACK', 'RECOMMENDATION');

-- CreateEnum
CREATE TYPE "MeasurementFailureType" AS ENUM ('MEASUREMENT_FAILURE', 'MISSING_EVIDENCE', 'LOW_CONFIDENCE', 'CONFLICT', 'QUALITY_DEGRADATION', 'CONSTITUTIONAL_VIOLATION');

-- CreateEnum
CREATE TYPE "MeasurementHistoryEventType" AS ENUM ('PROFILE_CREATED', 'PROFILE_UPDATED', 'CALCULATED', 'BENCHMARK_SET', 'FEEDBACK_RECORDED', 'FAILURE_RECORDED', 'PROGRESS_TRANSITION');

-- CreateTable
CREATE TABLE "measurement_profiles" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "index_type" "MeasurementIndexType" NOT NULL,
    "owner_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "target_value" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "minimum_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "normalization_min" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "normalization_max" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "current_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "current_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "progress_state" "MeasurementProgressState" NOT NULL DEFAULT 'NASCENT',
    "trend" "MeasurementTrend" NOT NULL DEFAULT 'UNKNOWN',
    "authority" "AuthorityLevel" NOT NULL DEFAULT 'OPERATIONAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "measurement_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_records" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "raw_score" DOUBLE PRECISION NOT NULL,
    "weighted_score" DOUBLE PRECISION NOT NULL,
    "normalized_score" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "delta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "benchmark_delta" DOUBLE PRECISION,
    "trend" "MeasurementTrend" NOT NULL DEFAULT 'UNKNOWN',
    "progress_state" "MeasurementProgressState" NOT NULL DEFAULT 'NASCENT',
    "components" JSONB,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "measurement_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_history" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "record_id" TEXT,
    "event_type" "MeasurementHistoryEventType" NOT NULL,
    "score_before" DOUBLE PRECISION,
    "score_after" DOUBLE PRECISION,
    "confidence_before" DOUBLE PRECISION,
    "confidence_after" DOUBLE PRECISION,
    "trend" "MeasurementTrend",
    "progress_state" "MeasurementProgressState",
    "failure_type" "MeasurementFailureType",
    "severity" TEXT,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "measurement_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_evidence" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "record_id" TEXT,
    "evidence_record_id" TEXT,
    "object_id" TEXT,
    "description" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "measurement_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_benchmarks" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "comparator" TEXT NOT NULL DEFAULT 'GTE',
    "source" TEXT,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "measurement_benchmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_feedback" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "record_id" TEXT,
    "feedback_type" "MeasurementFeedbackType" NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "recommendation" TEXT,
    "payload" JSONB,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "measurement_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "measurement_profiles_profile_id_key" ON "measurement_profiles"("profile_id");

-- CreateIndex
CREATE INDEX "measurement_profiles_workspace_id_deleted_at_index_type_idx" ON "measurement_profiles"("workspace_id", "deleted_at", "index_type");

-- CreateIndex
CREATE INDEX "measurement_profiles_workspace_id_progress_state_created_at_idx" ON "measurement_profiles"("workspace_id", "progress_state", "created_at");

-- CreateIndex
CREATE INDEX "measurement_profiles_profile_id_idx" ON "measurement_profiles"("profile_id");

-- CreateIndex
CREATE INDEX "measurement_records_profile_id_created_at_idx" ON "measurement_records"("profile_id", "created_at");

-- CreateIndex
CREATE INDEX "measurement_records_workspace_id_created_at_idx" ON "measurement_records"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "measurement_history_profile_id_created_at_idx" ON "measurement_history"("profile_id", "created_at");

-- CreateIndex
CREATE INDEX "measurement_history_workspace_id_event_type_created_at_idx" ON "measurement_history"("workspace_id", "event_type", "created_at");

-- CreateIndex
CREATE INDEX "measurement_history_workspace_id_failure_type_created_at_idx" ON "measurement_history"("workspace_id", "failure_type", "created_at");

-- CreateIndex
CREATE INDEX "measurement_evidence_profile_id_deleted_at_created_at_idx" ON "measurement_evidence"("profile_id", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "measurement_evidence_workspace_id_created_at_idx" ON "measurement_evidence"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "measurement_benchmarks_profile_id_deleted_at_created_at_idx" ON "measurement_benchmarks"("profile_id", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "measurement_feedback_profile_id_created_at_idx" ON "measurement_feedback"("profile_id", "created_at");

-- CreateIndex
CREATE INDEX "measurement_feedback_workspace_id_feedback_type_created_at_idx" ON "measurement_feedback"("workspace_id", "feedback_type", "created_at");

-- AddForeignKey
ALTER TABLE "measurement_profiles" ADD CONSTRAINT "measurement_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_records" ADD CONSTRAINT "measurement_records_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "measurement_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_records" ADD CONSTRAINT "measurement_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_history" ADD CONSTRAINT "measurement_history_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "measurement_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_history" ADD CONSTRAINT "measurement_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_evidence" ADD CONSTRAINT "measurement_evidence_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "measurement_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_evidence" ADD CONSTRAINT "measurement_evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_benchmarks" ADD CONSTRAINT "measurement_benchmarks_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "measurement_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_benchmarks" ADD CONSTRAINT "measurement_benchmarks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_feedback" ADD CONSTRAINT "measurement_feedback_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "measurement_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_feedback" ADD CONSTRAINT "measurement_feedback_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
