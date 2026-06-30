-- CreateEnum
CREATE TYPE "SourceCategory" AS ENUM ('INTERNAL', 'EXTERNAL', 'PARTNER', 'SENSOR', 'HUMAN', 'SYSTEM', 'DERIVED');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "FeedStage" AS ENUM ('RECEIVED', 'NORMALIZED', 'VALIDATED', 'CLASSIFIED', 'LINKED', 'ACCEPTED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FeedShadowMode" AS ENUM ('ACTIVE', 'SHADOW');

-- CreateEnum
CREATE TYPE "LearningStateType" AS ENUM ('OBSERVED', 'UNDERSTOOD', 'VERIFIED', 'GENERALIZED', 'CONNECTED', 'REUSABLE', 'CAPITALIZED', 'EVOLVING', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "LearningEventType" AS ENUM ('OBSERVATION', 'STATE_TRANSITION', 'REINFORCEMENT', 'CONTRADICTION');

-- CreateEnum
CREATE TYPE "PatternType" AS ENUM ('SIMILARITY', 'CLUSTERING', 'REPETITION', 'CONTRADICTION', 'REINFORCEMENT');

-- CreateEnum
CREATE TYPE "EvolutionType" AS ENUM ('REFINEMENT', 'CORRECTION', 'SUPERSEDING', 'DECAY', 'RETIREMENT');

-- CreateEnum
CREATE TYPE "CapitalizationStatus" AS ENUM ('TRIGGERED', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "intelligence_sources" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "description" TEXT,
    "category" "SourceCategory" NOT NULL DEFAULT 'INTERNAL',
    "authority_level" "AuthorityLevel" NOT NULL DEFAULT 'OPERATIONAL',
    "ownership_class" "OwnershipClass" NOT NULL DEFAULT 'INSTITUTIONAL',
    "trust_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "status" "SourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB DEFAULT '{}',
    "workspace_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "intelligence_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intelligence_feeds" (
    "id" TEXT NOT NULL,
    "feed_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "stage" "FeedStage" NOT NULL DEFAULT 'RECEIVED',
    "shadow_mode" "FeedShadowMode" NOT NULL DEFAULT 'ACTIVE',
    "classification" TEXT,
    "linked_object_id" TEXT,
    "trust_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "provenance_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "verification_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "validation_result" JSONB,
    "rejection_reason" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "workspace_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "intelligence_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_pipeline_events" (
    "id" TEXT NOT NULL,
    "feed_id" TEXT NOT NULL,
    "from_stage" "FeedStage",
    "to_stage" "FeedStage" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "notes" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_pipeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_states" (
    "id" TEXT NOT NULL,
    "learning_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "object_id" TEXT,
    "state" "LearningStateType" NOT NULL DEFAULT 'OBSERVED',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "reinforcement_count" INTEGER NOT NULL DEFAULT 0,
    "contradiction_count" INTEGER NOT NULL DEFAULT 0,
    "capitalized" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB DEFAULT '{}',
    "workspace_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "learning_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_events" (
    "id" TEXT NOT NULL,
    "learning_id" TEXT NOT NULL,
    "event_type" "LearningEventType" NOT NULL,
    "from_state" "LearningStateType",
    "to_state" "LearningStateType",
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "notes" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patterns" (
    "id" TEXT NOT NULL,
    "pattern_id" TEXT NOT NULL,
    "pattern_type" "PatternType" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "member_object_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB DEFAULT '{}',
    "workspace_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_evolutions" (
    "id" TEXT NOT NULL,
    "learning_id" TEXT NOT NULL,
    "evolution_type" "EvolutionType" NOT NULL,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_evolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capitalization_events" (
    "id" TEXT NOT NULL,
    "learning_id" TEXT NOT NULL,
    "object_id" TEXT,
    "trigger_reason" TEXT NOT NULL,
    "capital_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "capital_category" "CapitalCategory",
    "status" "CapitalizationStatus" NOT NULL DEFAULT 'TRIGGERED',
    "metadata" JSONB DEFAULT '{}',
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capitalization_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intelligence_sources_source_id_key" ON "intelligence_sources"("source_id");

-- CreateIndex
CREATE INDEX "intelligence_sources_workspace_id_deleted_at_status_idx" ON "intelligence_sources"("workspace_id", "deleted_at", "status");

-- CreateIndex
CREATE INDEX "intelligence_sources_workspace_id_created_at_idx" ON "intelligence_sources"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "intelligence_feeds_feed_id_key" ON "intelligence_feeds"("feed_id");

-- CreateIndex
CREATE INDEX "intelligence_feeds_workspace_id_deleted_at_stage_idx" ON "intelligence_feeds"("workspace_id", "deleted_at", "stage");

-- CreateIndex
CREATE INDEX "intelligence_feeds_workspace_id_shadow_mode_idx" ON "intelligence_feeds"("workspace_id", "shadow_mode");

-- CreateIndex
CREATE INDEX "intelligence_feeds_source_id_idx" ON "intelligence_feeds"("source_id");

-- CreateIndex
CREATE INDEX "feed_pipeline_events_feed_id_created_at_idx" ON "feed_pipeline_events"("feed_id", "created_at");

-- CreateIndex
CREATE INDEX "feed_pipeline_events_workspace_id_created_at_idx" ON "feed_pipeline_events"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "learning_states_learning_id_key" ON "learning_states"("learning_id");

-- CreateIndex
CREATE INDEX "learning_states_workspace_id_deleted_at_state_idx" ON "learning_states"("workspace_id", "deleted_at", "state");

-- CreateIndex
CREATE INDEX "learning_states_workspace_id_created_at_idx" ON "learning_states"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "learning_events_learning_id_created_at_idx" ON "learning_events"("learning_id", "created_at");

-- CreateIndex
CREATE INDEX "learning_events_workspace_id_created_at_idx" ON "learning_events"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "patterns_pattern_id_key" ON "patterns"("pattern_id");

-- CreateIndex
CREATE INDEX "patterns_workspace_id_deleted_at_pattern_type_idx" ON "patterns"("workspace_id", "deleted_at", "pattern_type");

-- CreateIndex
CREATE INDEX "patterns_workspace_id_created_at_idx" ON "patterns"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "knowledge_evolutions_learning_id_created_at_idx" ON "knowledge_evolutions"("learning_id", "created_at");

-- CreateIndex
CREATE INDEX "knowledge_evolutions_workspace_id_created_at_idx" ON "knowledge_evolutions"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "capitalization_events_learning_id_created_at_idx" ON "capitalization_events"("learning_id", "created_at");

-- CreateIndex
CREATE INDEX "capitalization_events_workspace_id_created_at_idx" ON "capitalization_events"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "intelligence_sources" ADD CONSTRAINT "intelligence_sources_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_feeds" ADD CONSTRAINT "intelligence_feeds_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "intelligence_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_feeds" ADD CONSTRAINT "intelligence_feeds_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_pipeline_events" ADD CONSTRAINT "feed_pipeline_events_feed_id_fkey" FOREIGN KEY ("feed_id") REFERENCES "intelligence_feeds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_pipeline_events" ADD CONSTRAINT "feed_pipeline_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_states" ADD CONSTRAINT "learning_states_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_learning_id_fkey" FOREIGN KEY ("learning_id") REFERENCES "learning_states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patterns" ADD CONSTRAINT "patterns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_evolutions" ADD CONSTRAINT "knowledge_evolutions_learning_id_fkey" FOREIGN KEY ("learning_id") REFERENCES "learning_states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_evolutions" ADD CONSTRAINT "knowledge_evolutions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capitalization_events" ADD CONSTRAINT "capitalization_events_learning_id_fkey" FOREIGN KEY ("learning_id") REFERENCES "learning_states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capitalization_events" ADD CONSTRAINT "capitalization_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
