-- CreateEnum
CREATE TYPE "IntelligenceLifecycleState" AS ENUM ('DRAFT', 'INGESTED', 'VALIDATED', 'ACTIVE', 'LINKED', 'MEASURED', 'CAPITALIZED', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IntelligenceRelationshipType" AS ENUM ('DERIVES_FROM', 'SUPPORTS', 'CONTRADICTS', 'REFINES', 'REPLACES', 'DEPENDS_ON', 'MEASURES', 'GOVERNS', 'CAPITALIZES', 'BELONGS_TO');

-- CreateEnum
CREATE TYPE "ProvenanceVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuthorityLevel" AS ENUM ('SYSTEM', 'OPERATIONAL', 'INSTITUTIONAL', 'SOVEREIGN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntelligenceObjectType" ADD VALUE 'INTENT';
ALTER TYPE "IntelligenceObjectType" ADD VALUE 'KNOWLEDGE';
ALTER TYPE "IntelligenceObjectType" ADD VALUE 'EVIDENCE';
ALTER TYPE "IntelligenceObjectType" ADD VALUE 'SOURCE';
ALTER TYPE "IntelligenceObjectType" ADD VALUE 'MODEL';
ALTER TYPE "IntelligenceObjectType" ADD VALUE 'TOOL';
ALTER TYPE "IntelligenceObjectType" ADD VALUE 'AGENT';
ALTER TYPE "IntelligenceObjectType" ADD VALUE 'EVALUATION';
ALTER TYPE "IntelligenceObjectType" ADD VALUE 'MEMORY';
ALTER TYPE "IntelligenceObjectType" ADD VALUE 'DECISION';
ALTER TYPE "IntelligenceObjectType" ADD VALUE 'MEASUREMENT';
ALTER TYPE "IntelligenceObjectType" ADD VALUE 'CAPITAL';

-- AlterTable
ALTER TABLE "intelligence_objects" ADD COLUMN     "authority_level" "AuthorityLevel" NOT NULL DEFAULT 'OPERATIONAL',
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "lifecycle_state" "IntelligenceLifecycleState" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "intelligence_object_relationships" (
    "id" TEXT NOT NULL,
    "source_object_id" TEXT NOT NULL,
    "target_object_id" TEXT NOT NULL,
    "relationship_type" "IntelligenceRelationshipType" NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "intelligence_object_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intelligence_object_provenance" (
    "id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "source_identity" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "extraction_method" TEXT NOT NULL,
    "verification_status" "ProvenanceVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "authority_level" "AuthorityLevel" NOT NULL DEFAULT 'OPERATIONAL',
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intelligence_object_provenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intelligence_object_lifecycle_events" (
    "id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "from_state" "IntelligenceLifecycleState",
    "to_state" "IntelligenceLifecycleState" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intelligence_object_lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intelligence_object_relationships_workspace_id_created_at_idx" ON "intelligence_object_relationships"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "intelligence_object_relationships_source_object_id_idx" ON "intelligence_object_relationships"("source_object_id");

-- CreateIndex
CREATE INDEX "intelligence_object_relationships_target_object_id_idx" ON "intelligence_object_relationships"("target_object_id");

-- CreateIndex
CREATE INDEX "intelligence_object_provenance_object_id_idx" ON "intelligence_object_provenance"("object_id");

-- CreateIndex
CREATE INDEX "intelligence_object_provenance_workspace_id_created_at_idx" ON "intelligence_object_provenance"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "intelligence_object_lifecycle_events_object_id_created_at_idx" ON "intelligence_object_lifecycle_events"("object_id", "created_at");

-- CreateIndex
CREATE INDEX "intelligence_object_lifecycle_events_workspace_id_created_a_idx" ON "intelligence_object_lifecycle_events"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "intelligence_objects_workspace_id_deleted_at_lifecycle_stat_idx" ON "intelligence_objects"("workspace_id", "deleted_at", "lifecycle_state");

-- AddForeignKey
ALTER TABLE "intelligence_object_relationships" ADD CONSTRAINT "intelligence_object_relationships_source_object_id_fkey" FOREIGN KEY ("source_object_id") REFERENCES "intelligence_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_object_relationships" ADD CONSTRAINT "intelligence_object_relationships_target_object_id_fkey" FOREIGN KEY ("target_object_id") REFERENCES "intelligence_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_object_relationships" ADD CONSTRAINT "intelligence_object_relationships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_object_provenance" ADD CONSTRAINT "intelligence_object_provenance_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "intelligence_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_object_provenance" ADD CONSTRAINT "intelligence_object_provenance_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_object_lifecycle_events" ADD CONSTRAINT "intelligence_object_lifecycle_events_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "intelligence_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_object_lifecycle_events" ADD CONSTRAINT "intelligence_object_lifecycle_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
