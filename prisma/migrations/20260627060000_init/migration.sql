-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "IntelligenceObjectType" AS ENUM ('SIGNAL', 'PATTERN', 'JUDGMENT', 'UNDERSTANDING', 'WISDOM', 'EXTERNAL_INTELLIGENCE');

-- CreateEnum
CREATE TYPE "ObjectState" AS ENUM ('ACTIVE', 'DORMANT', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ShadowStatus" AS ENUM ('INTERNAL', 'EXTERNAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "OwnershipClass" AS ENUM ('PERSONAL', 'COMPANION', 'INSTITUTIONAL', 'CIVILIZATION');

-- CreateEnum
CREATE TYPE "PrivacyLevel" AS ENUM ('PUBLIC', 'INSTITUTIONAL', 'CONFIDENTIAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "CapitalCategory" AS ENUM ('CLINICAL', 'OPERATIONS', 'COMMERCIAL', 'STRATEGY', 'GOVERNANCE', 'KNOWLEDGE');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPERIMENTAL', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "ToolCategory" AS ENUM ('SEARCH', 'ANALYTICS', 'AUTOMATION', 'COMMUNICATION', 'KNOWLEDGE', 'MEDIA');

-- CreateEnum
CREATE TYPE "ToolStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPERIMENTAL');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('CATALOGED', 'READY', 'OPERATIONAL', 'RESEARCH', 'DEPRECATED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "role_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_seen" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intelligence_objects" (
    "id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "semantic_summary" TEXT,
    "object_type" "IntelligenceObjectType" NOT NULL,
    "layer" TEXT NOT NULL DEFAULT 'L1_FOUNDATIONAL',
    "origin_source" TEXT NOT NULL DEFAULT 'L2_SIL',
    "creator_identity" TEXT NOT NULL DEFAULT 'system',
    "ownership_class" "OwnershipClass" NOT NULL DEFAULT 'INSTITUTIONAL',
    "amanah_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "trust_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "quality_index" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "state" "ObjectState" NOT NULL DEFAULT 'ACTIVE',
    "shadow_status" "ShadowStatus" NOT NULL DEFAULT 'INTERNAL',
    "source_layer" TEXT NOT NULL DEFAULT 'L1_FOUNDATIONAL',
    "privacy_level" "PrivacyLevel" NOT NULL DEFAULT 'INSTITUTIONAL',
    "fic_validated" BOOLEAN NOT NULL DEFAULT false,
    "constraint_basis" TEXT,
    "capital_category" "CapitalCategory",
    "capital_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "owner_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intelligence_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_profiles" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "provider_name" TEXT NOT NULL,
    "status" "ProviderStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "domain_fitness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "risk_fitness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "historical_performance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidence_quality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "judgment_quality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hallucination_resistance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "governance_compliance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cost_efficiency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reliability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outcome_success" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ownership_compatibility" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ise_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_capital" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "models" TEXT[],
    "cost_per_1k_tokens" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "success_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_evaluations" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "ise_score" DOUBLE PRECISION NOT NULL,
    "dimensions" JSONB NOT NULL DEFAULT '{}',
    "intent" TEXT NOT NULL,
    "context" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_profiles" (
    "id" TEXT NOT NULL,
    "tool_id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "category" "ToolCategory" NOT NULL,
    "status" "ToolStatus" NOT NULL DEFAULT 'ACTIVE',
    "capabilities" TEXT[],
    "cost_per_call" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_capital" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_records" (
    "id" TEXT NOT NULL,
    "evidence_id" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "intelligence_object_id" TEXT,
    "owner_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "evidence_quality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "capital_created" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "provider_candidates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider_selected" TEXT,
    "tool_candidates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tool_selected" TEXT,
    "judgment" TEXT,
    "outcome" TEXT,
    "learning" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_decisions" (
    "id" TEXT NOT NULL,
    "decision_type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'UNDEFINED',
    "amanah_score" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "fic_validated" BOOLEAN NOT NULL DEFAULT false,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capital_records" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" "CapitalCategory" NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "source_object_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capital_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provenance_records" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frontier_assets" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "asset_class" TEXT NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'CATALOGED',
    "priority_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "frontier_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sovereignty_metrics" (
    "id" TEXT NOT NULL,
    "metric_type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "ksr" DOUBLE PRECISION,
    "pdr" DOUBLE PRECISION,
    "krr" DOUBLE PRECISION,
    "kor" DOUBLE PRECISION,
    "scg" DOUBLE PRECISION,
    "sai" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sovereignty_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PermissionToRole" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PermissionToRole_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_resource_action_key" ON "permissions"("resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "intelligence_objects_object_id_key" ON "intelligence_objects"("object_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_profiles_provider_id_key" ON "provider_profiles"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "tool_profiles_tool_id_key" ON "tool_profiles"("tool_id");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_records_evidence_id_key" ON "evidence_records"("evidence_id");

-- CreateIndex
CREATE UNIQUE INDEX "frontier_assets_asset_id_key" ON "frontier_assets"("asset_id");

-- CreateIndex
CREATE INDEX "_PermissionToRole_B_index" ON "_PermissionToRole"("B");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_objects" ADD CONSTRAINT "intelligence_objects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intelligence_objects" ADD CONSTRAINT "intelligence_objects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_evaluations" ADD CONSTRAINT "provider_evaluations_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_profiles" ADD CONSTRAINT "tool_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_intelligence_object_id_fkey" FOREIGN KEY ("intelligence_object_id") REFERENCES "intelligence_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_decisions" ADD CONSTRAINT "governance_decisions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_decisions" ADD CONSTRAINT "governance_decisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_records" ADD CONSTRAINT "capital_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provenance_records" ADD CONSTRAINT "provenance_records_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "intelligence_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_A_fkey" FOREIGN KEY ("A") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_B_fkey" FOREIGN KEY ("B") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

