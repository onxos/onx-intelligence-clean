-- FIC v0.2 — Founder Intent Compiler (IW-06)
-- Additive constitutional governance migration. Build-only on D11/D12/D16.
-- No destructive modification of prior tables.

-- CreateEnum
CREATE TYPE "FounderIntentLifecycle" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FounderIntentPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "FounderIntentVersionType" AS ENUM ('MAJOR', 'MINOR', 'REVISION');

-- CreateEnum
CREATE TYPE "FounderIntentRelationType" AS ENUM ('DEPENDS_ON', 'BLOCKS', 'SUPPORTS', 'REFINES', 'REPLACES', 'INHERITS', 'IMPLEMENTS', 'GOVERNS');

-- CreateEnum
CREATE TYPE "FounderIntentConflictType" AS ENUM ('DUPLICATE', 'CONTRADICTION', 'SUPERSEDED', 'CIRCULAR_DEPENDENCY', 'PRIORITY_CONFLICT', 'AUTHORITY_CONFLICT');

-- CreateEnum
CREATE TYPE "FounderIntentConflictSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FounderIntentConflictStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "FounderIntentReviewDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "FounderOverrideType" AS ENUM ('PRIORITY', 'OWNERSHIP', 'DEPENDENCY', 'STATUS', 'CONSTITUTIONAL_ROUTING');

-- CreateTable
CREATE TABLE "founder_intents" (
    "id" TEXT NOT NULL,
    "intent_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rationale" TEXT,
    "constitutional_authority" TEXT NOT NULL,
    "priority" "FounderIntentPriority" NOT NULL DEFAULT 'MEDIUM',
    "owner_id" TEXT NOT NULL,
    "dependencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "affected_domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lifecycle" "FounderIntentLifecycle" NOT NULL DEFAULT 'DRAFT',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "major_version" INTEGER NOT NULL DEFAULT 1,
    "minor_version" INTEGER NOT NULL DEFAULT 0,
    "revision_version" INTEGER NOT NULL DEFAULT 0,
    "parent_intent_id" TEXT,
    "superseded_by_id" TEXT,
    "content_hash" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "workspace_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "founder_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "founder_intent_versions" (
    "id" TEXT NOT NULL,
    "intent_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_type" "FounderIntentVersionType" NOT NULL,
    "major_version" INTEGER NOT NULL,
    "minor_version" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rationale" TEXT,
    "snapshot" JSONB NOT NULL,
    "diff" JSONB,
    "change_summary" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "author_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "founder_intent_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "founder_intent_relationships" (
    "id" TEXT NOT NULL,
    "source_intent_id" TEXT NOT NULL,
    "target_intent_id" TEXT NOT NULL,
    "relation_type" "FounderIntentRelationType" NOT NULL,
    "notes" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "workspace_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "founder_intent_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "founder_intent_reviews" (
    "id" TEXT NOT NULL,
    "intent_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "review_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "constitutional_references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "decision" "FounderIntentReviewDecision" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "founder_intent_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "founder_intent_conflicts" (
    "id" TEXT NOT NULL,
    "intent_id" TEXT NOT NULL,
    "counterpart_intent_id" TEXT,
    "conflict_type" "FounderIntentConflictType" NOT NULL,
    "severity" "FounderIntentConflictSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "FounderIntentConflictStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "recommended_resolution" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "workspace_id" TEXT NOT NULL,
    "detected_by_id" TEXT NOT NULL,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "founder_intent_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "founder_override_events" (
    "id" TEXT NOT NULL,
    "intent_id" TEXT NOT NULL,
    "override_type" "FounderOverrideType" NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "operator_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "founder_override_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "founder_intents_intent_id_key" ON "founder_intents"("intent_id");

-- CreateIndex
CREATE INDEX "founder_intents_workspace_id_deleted_at_lifecycle_idx" ON "founder_intents"("workspace_id", "deleted_at", "lifecycle");

-- CreateIndex
CREATE INDEX "founder_intents_workspace_id_created_at_idx" ON "founder_intents"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "founder_intents_parent_intent_id_idx" ON "founder_intents"("parent_intent_id");

-- CreateIndex
CREATE INDEX "founder_intent_versions_intent_id_created_at_idx" ON "founder_intent_versions"("intent_id", "created_at");

-- CreateIndex
CREATE INDEX "founder_intent_versions_workspace_id_created_at_idx" ON "founder_intent_versions"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "founder_intent_versions_intent_id_version_number_key" ON "founder_intent_versions"("intent_id", "version_number");

-- CreateIndex
CREATE INDEX "founder_intent_relationships_workspace_id_created_at_idx" ON "founder_intent_relationships"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "founder_intent_relationships_source_intent_id_idx" ON "founder_intent_relationships"("source_intent_id");

-- CreateIndex
CREATE INDEX "founder_intent_relationships_target_intent_id_idx" ON "founder_intent_relationships"("target_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "founder_intent_relationships_src_tgt_type_key" ON "founder_intent_relationships"("source_intent_id", "target_intent_id", "relation_type");

-- CreateIndex
CREATE INDEX "founder_intent_reviews_intent_id_created_at_idx" ON "founder_intent_reviews"("intent_id", "created_at");

-- CreateIndex
CREATE INDEX "founder_intent_reviews_workspace_id_created_at_idx" ON "founder_intent_reviews"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "founder_intent_conflicts_workspace_id_status_severity_idx" ON "founder_intent_conflicts"("workspace_id", "status", "severity");

-- CreateIndex
CREATE INDEX "founder_intent_conflicts_intent_id_created_at_idx" ON "founder_intent_conflicts"("intent_id", "created_at");

-- CreateIndex
CREATE INDEX "founder_override_events_intent_id_created_at_idx" ON "founder_override_events"("intent_id", "created_at");

-- CreateIndex
CREATE INDEX "founder_override_events_workspace_id_created_at_idx" ON "founder_override_events"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "founder_intents" ADD CONSTRAINT "founder_intents_parent_intent_id_fkey" FOREIGN KEY ("parent_intent_id") REFERENCES "founder_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_intents" ADD CONSTRAINT "founder_intents_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "founder_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_intents" ADD CONSTRAINT "founder_intents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_intent_versions" ADD CONSTRAINT "founder_intent_versions_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "founder_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_intent_versions" ADD CONSTRAINT "founder_intent_versions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_intent_relationships" ADD CONSTRAINT "founder_intent_relationships_source_intent_id_fkey" FOREIGN KEY ("source_intent_id") REFERENCES "founder_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_intent_relationships" ADD CONSTRAINT "founder_intent_relationships_target_intent_id_fkey" FOREIGN KEY ("target_intent_id") REFERENCES "founder_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_intent_relationships" ADD CONSTRAINT "founder_intent_relationships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_intent_reviews" ADD CONSTRAINT "founder_intent_reviews_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "founder_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_intent_reviews" ADD CONSTRAINT "founder_intent_reviews_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_intent_conflicts" ADD CONSTRAINT "founder_intent_conflicts_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "founder_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_intent_conflicts" ADD CONSTRAINT "founder_intent_conflicts_counterpart_intent_id_fkey" FOREIGN KEY ("counterpart_intent_id") REFERENCES "founder_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_intent_conflicts" ADD CONSTRAINT "founder_intent_conflicts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_override_events" ADD CONSTRAINT "founder_override_events_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "founder_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_override_events" ADD CONSTRAINT "founder_override_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
