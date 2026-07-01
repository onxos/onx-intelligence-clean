-- FIAR — Frontier Intelligence Asset Registry (Wave 12)
-- Additive: canonical inventory of every strategic Intelligence asset. Reuses
-- D16/FIC/USFIP/IFC/IUC/D17/D18/D19 by reference (no FK, no duplicated storage).
-- NOT reasoning, planning, decision, platform.

-- CreateEnum
CREATE TYPE "FIARAssetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED', 'REPLACED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "FIARAssetClass" AS ENUM ('KNOWLEDGE', 'LEARNING', 'MEMORY', 'EVIDENCE', 'INTENT', 'CAPITAL', 'MEASUREMENT', 'RUNTIME', 'EXCHANGE', 'GOVERNANCE', 'PROTOCOL', 'MODEL', 'TOOL', 'PROVIDER', 'REASONING', 'PLANNING', 'DECISION');

-- CreateEnum
CREATE TYPE "FIARComponentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "FIAROwnershipKind" AS ENUM ('FOUNDER', 'INSTITUTIONAL', 'WORKSPACE', 'DELEGATED');

-- CreateEnum
CREATE TYPE "FIARRelationshipKind" AS ENUM ('DEPENDS_ON', 'DERIVES_FROM', 'REPLACES', 'RELATES_TO', 'COMPOSES', 'REFERENCES');

-- CreateTable
CREATE TABLE "fiar_assets" (
    "id" TEXT NOT NULL,
    "fiar_asset_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "asset_class" "FIARAssetClass" NOT NULL,
    "status" "FIARAssetStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "source_runtime" TEXT,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "constitutional_ref" TEXT,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "replaced_by_id" TEXT,
    "history_seq" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fiar_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiar_categories" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "asset_class" "FIARAssetClass",
    "status" "FIARComponentStatus" NOT NULL DEFAULT 'ACTIVE',
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fiar_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiar_classifications" (
    "id" TEXT NOT NULL,
    "classification_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "asset_class" "FIARAssetClass" NOT NULL,
    "category_id" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rationale" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiar_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiar_ownerships" (
    "id" TEXT NOT NULL,
    "ownership_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "ownership_kind" "FIAROwnershipKind" NOT NULL DEFAULT 'WORKSPACE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiar_ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiar_relationships" (
    "id" TEXT NOT NULL,
    "relationship_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "target_asset_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" "FIARRelationshipKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "rationale" TEXT,
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiar_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiar_history" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "constitutional_ref" TEXT,
    "notes" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiar_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiar_evidence" (
    "id" TEXT NOT NULL,
    "evidence_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "summary" TEXT,
    "payload" JSONB,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiar_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiar_policies" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "FIARComponentStatus" NOT NULL DEFAULT 'ACTIVE',
    "require_ownership" BOOLEAN NOT NULL DEFAULT true,
    "require_reference" BOOLEAN NOT NULL DEFAULT false,
    "allowed_classes" JSONB,
    "constitutional_ref" TEXT,
    "rules" JSONB,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fiar_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fiar_assets_fiar_asset_id_key" ON "fiar_assets"("fiar_asset_id");
CREATE INDEX "fiar_assets_workspace_id_deleted_at_status_idx" ON "fiar_assets"("workspace_id", "deleted_at", "status");
CREATE INDEX "fiar_assets_workspace_id_asset_class_idx" ON "fiar_assets"("workspace_id", "asset_class");
CREATE INDEX "fiar_assets_workspace_id_created_at_idx" ON "fiar_assets"("workspace_id", "created_at");
CREATE INDEX "fiar_assets_fiar_asset_id_idx" ON "fiar_assets"("fiar_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiar_categories_category_id_key" ON "fiar_categories"("category_id");
CREATE UNIQUE INDEX "fiar_categories_workspace_id_code_key" ON "fiar_categories"("workspace_id", "code");
CREATE INDEX "fiar_categories_workspace_id_status_idx" ON "fiar_categories"("workspace_id", "status");
CREATE INDEX "fiar_categories_category_id_idx" ON "fiar_categories"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiar_classifications_classification_id_key" ON "fiar_classifications"("classification_id");
CREATE INDEX "fiar_classifications_asset_id_active_idx" ON "fiar_classifications"("asset_id", "active");
CREATE INDEX "fiar_classifications_workspace_id_asset_class_idx" ON "fiar_classifications"("workspace_id", "asset_class");
CREATE INDEX "fiar_classifications_classification_id_idx" ON "fiar_classifications"("classification_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiar_ownerships_ownership_id_key" ON "fiar_ownerships"("ownership_id");
CREATE INDEX "fiar_ownerships_asset_id_active_idx" ON "fiar_ownerships"("asset_id", "active");
CREATE INDEX "fiar_ownerships_workspace_id_owner_id_idx" ON "fiar_ownerships"("workspace_id", "owner_id");
CREATE INDEX "fiar_ownerships_ownership_id_idx" ON "fiar_ownerships"("ownership_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiar_relationships_relationship_id_key" ON "fiar_relationships"("relationship_id");
CREATE UNIQUE INDEX "fiar_relationships_asset_id_target_asset_id_kind_key" ON "fiar_relationships"("asset_id", "target_asset_id", "kind");
CREATE INDEX "fiar_relationships_asset_id_active_idx" ON "fiar_relationships"("asset_id", "active");
CREATE INDEX "fiar_relationships_target_asset_id_active_idx" ON "fiar_relationships"("target_asset_id", "active");
CREATE INDEX "fiar_relationships_workspace_id_kind_idx" ON "fiar_relationships"("workspace_id", "kind");
CREATE INDEX "fiar_relationships_relationship_id_idx" ON "fiar_relationships"("relationship_id");

-- CreateIndex
CREATE INDEX "fiar_history_asset_id_created_at_idx" ON "fiar_history"("asset_id", "created_at");
CREATE INDEX "fiar_history_workspace_id_event_type_idx" ON "fiar_history"("workspace_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "fiar_evidence_evidence_id_key" ON "fiar_evidence"("evidence_id");
CREATE INDEX "fiar_evidence_asset_id_created_at_idx" ON "fiar_evidence"("asset_id", "created_at");
CREATE INDEX "fiar_evidence_workspace_id_evidence_type_idx" ON "fiar_evidence"("workspace_id", "evidence_type");
CREATE INDEX "fiar_evidence_evidence_id_idx" ON "fiar_evidence"("evidence_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiar_policies_policy_id_key" ON "fiar_policies"("policy_id");
CREATE INDEX "fiar_policies_workspace_id_status_idx" ON "fiar_policies"("workspace_id", "status");
CREATE INDEX "fiar_policies_policy_id_idx" ON "fiar_policies"("policy_id");

-- AddForeignKey
ALTER TABLE "fiar_assets" ADD CONSTRAINT "fiar_assets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiar_categories" ADD CONSTRAINT "fiar_categories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiar_classifications" ADD CONSTRAINT "fiar_classifications_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "fiar_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiar_classifications" ADD CONSTRAINT "fiar_classifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiar_classifications" ADD CONSTRAINT "fiar_classifications_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "fiar_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiar_ownerships" ADD CONSTRAINT "fiar_ownerships_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "fiar_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiar_ownerships" ADD CONSTRAINT "fiar_ownerships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiar_relationships" ADD CONSTRAINT "fiar_relationships_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "fiar_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiar_relationships" ADD CONSTRAINT "fiar_relationships_target_asset_id_fkey" FOREIGN KEY ("target_asset_id") REFERENCES "fiar_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiar_relationships" ADD CONSTRAINT "fiar_relationships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiar_history" ADD CONSTRAINT "fiar_history_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "fiar_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiar_history" ADD CONSTRAINT "fiar_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiar_evidence" ADD CONSTRAINT "fiar_evidence_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "fiar_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiar_evidence" ADD CONSTRAINT "fiar_evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiar_policies" ADD CONSTRAINT "fiar_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
