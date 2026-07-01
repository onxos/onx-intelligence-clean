-- D20 Implementation Boundary & Build Architecture (Wave 16)
-- Additive governance/documentation layer: how ONX Intelligence is built,
-- assembled, validated and deployed. Introduces NO new intelligence
-- capabilities. Reuses existing modules by reference only (no FK, no
-- duplicated storage). No Platform, no Atlas activation, no execution
-- automation.

-- CreateEnum
CREATE TYPE "ImplementationUnitKind" AS ENUM ('RUNTIME', 'ENGINE', 'PROTOCOL', 'GOVERNANCE', 'REGISTRY', 'INTERFACE', 'INFRASTRUCTURE');

-- CreateEnum
CREATE TYPE "ImplementationUnitStatus" AS ENUM ('DECLARED', 'VALIDATED', 'BUILT', 'DEPLOYED', 'DEPRECATED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "ImplementationBoundaryKind" AS ENUM ('EXECUTION', 'RUNTIME', 'BUILD', 'DEPLOYMENT', 'DEPENDENCY');

-- CreateEnum
CREATE TYPE "ImplementationDependencyKind" AS ENUM ('REQUIRED', 'OPTIONAL', 'PEER', 'BUILD', 'RUNTIME');

-- CreateEnum
CREATE TYPE "BuildProfileStatus" AS ENUM ('DRAFT', 'VALIDATED', 'FAILED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "DeploymentProfileStatus" AS ENUM ('DRAFT', 'VALIDATED', 'FAILED', 'DEPLOYED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "DeploymentEnvironment" AS ENUM ('DEVELOPMENT', 'STAGING', 'PRODUCTION');

-- CreateTable
CREATE TABLE "implementation_packages" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "ImplementationUnitStatus" NOT NULL DEFAULT 'DECLARED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "unit_count" INTEGER NOT NULL DEFAULT 0,
    "constitutional_ref" TEXT,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "implementation_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_units" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "ImplementationUnitKind" NOT NULL,
    "status" "ImplementationUnitStatus" NOT NULL DEFAULT 'DECLARED',
    "execution_scope" TEXT NOT NULL,
    "ownership" TEXT NOT NULL,
    "runtime_boundary" TEXT,
    "build_boundary" TEXT,
    "deployment_boundary" TEXT,
    "package_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "dependency_count" INTEGER NOT NULL DEFAULT 0,
    "boundary_count" INTEGER NOT NULL DEFAULT 0,
    "constitutional_ref" TEXT,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "implementation_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_dependencies" (
    "id" TEXT NOT NULL,
    "dependency_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "from_unit_id" TEXT NOT NULL,
    "to_unit_id" TEXT NOT NULL,
    "kind" "ImplementationDependencyKind" NOT NULL DEFAULT 'REQUIRED',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "satisfied" BOOLEAN NOT NULL DEFAULT true,
    "cyclic" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "implementation_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_boundaries" (
    "id" TEXT NOT NULL,
    "boundary_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "kind" "ImplementationBoundaryKind" NOT NULL,
    "scope" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "constitutional_ref" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "implementation_boundaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_evidence" (
    "id" TEXT NOT NULL,
    "evidence_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "summary" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "implementation_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_history" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "constitutional_ref" TEXT,
    "notes" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "implementation_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "build_profiles" (
    "id" TEXT NOT NULL,
    "build_profile_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "package_ref" TEXT,
    "status" "BuildProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "valid" BOOLEAN NOT NULL DEFAULT false,
    "stages" JSONB NOT NULL,
    "artifacts" JSONB,
    "compatibility" JSONB,
    "build_metadata" JSONB,
    "issues" JSONB,
    "constitutional_ref" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "build_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_profiles" (
    "id" TEXT NOT NULL,
    "deployment_profile_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "environment" "DeploymentEnvironment" NOT NULL DEFAULT 'DEVELOPMENT',
    "build_profile_ref" TEXT,
    "status" "DeploymentProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "valid" BOOLEAN NOT NULL DEFAULT false,
    "rollback_ready" BOOLEAN NOT NULL DEFAULT false,
    "rollback_metadata" JSONB,
    "validation_issues" JSONB,
    "constitutional_ref" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "deployment_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "implementation_packages_package_id_key" ON "implementation_packages"("package_id");

-- CreateIndex
CREATE INDEX "implementation_packages_workspace_id_deleted_at_idx" ON "implementation_packages"("workspace_id", "deleted_at");

-- CreateIndex
CREATE INDEX "implementation_packages_workspace_id_created_at_idx" ON "implementation_packages"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "implementation_packages_package_id_idx" ON "implementation_packages"("package_id");

-- CreateIndex
CREATE UNIQUE INDEX "implementation_packages_workspace_id_slug_key" ON "implementation_packages"("workspace_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "implementation_units_unit_id_key" ON "implementation_units"("unit_id");

-- CreateIndex
CREATE INDEX "implementation_units_workspace_id_deleted_at_status_idx" ON "implementation_units"("workspace_id", "deleted_at", "status");

-- CreateIndex
CREATE INDEX "implementation_units_workspace_id_kind_idx" ON "implementation_units"("workspace_id", "kind");

-- CreateIndex
CREATE INDEX "implementation_units_workspace_id_created_at_idx" ON "implementation_units"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "implementation_units_package_id_idx" ON "implementation_units"("package_id");

-- CreateIndex
CREATE INDEX "implementation_units_unit_id_idx" ON "implementation_units"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "implementation_units_workspace_id_slug_key" ON "implementation_units"("workspace_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "implementation_dependencies_dependency_id_key" ON "implementation_dependencies"("dependency_id");

-- CreateIndex
CREATE INDEX "implementation_dependencies_workspace_id_created_at_idx" ON "implementation_dependencies"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "implementation_dependencies_from_unit_id_idx" ON "implementation_dependencies"("from_unit_id");

-- CreateIndex
CREATE INDEX "implementation_dependencies_to_unit_id_idx" ON "implementation_dependencies"("to_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "implementation_dependencies_from_unit_id_to_unit_id_kind_key" ON "implementation_dependencies"("from_unit_id", "to_unit_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "implementation_boundaries_boundary_id_key" ON "implementation_boundaries"("boundary_id");

-- CreateIndex
CREATE INDEX "implementation_boundaries_workspace_id_created_at_idx" ON "implementation_boundaries"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "implementation_boundaries_unit_id_kind_idx" ON "implementation_boundaries"("unit_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "implementation_evidence_evidence_id_key" ON "implementation_evidence"("evidence_id");

-- CreateIndex
CREATE INDEX "implementation_evidence_workspace_id_created_at_idx" ON "implementation_evidence"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "implementation_evidence_subject_type_subject_id_idx" ON "implementation_evidence"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "implementation_history_workspace_id_created_at_idx" ON "implementation_history"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "implementation_history_subject_type_subject_id_idx" ON "implementation_history"("subject_type", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "build_profiles_build_profile_id_key" ON "build_profiles"("build_profile_id");

-- CreateIndex
CREATE INDEX "build_profiles_workspace_id_deleted_at_status_idx" ON "build_profiles"("workspace_id", "deleted_at", "status");

-- CreateIndex
CREATE INDEX "build_profiles_workspace_id_created_at_idx" ON "build_profiles"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "build_profiles_build_profile_id_idx" ON "build_profiles"("build_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "deployment_profiles_deployment_profile_id_key" ON "deployment_profiles"("deployment_profile_id");

-- CreateIndex
CREATE INDEX "deployment_profiles_workspace_id_deleted_at_status_idx" ON "deployment_profiles"("workspace_id", "deleted_at", "status");

-- CreateIndex
CREATE INDEX "deployment_profiles_workspace_id_environment_idx" ON "deployment_profiles"("workspace_id", "environment");

-- CreateIndex
CREATE INDEX "deployment_profiles_workspace_id_created_at_idx" ON "deployment_profiles"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "deployment_profiles_deployment_profile_id_idx" ON "deployment_profiles"("deployment_profile_id");

-- AddForeignKey
ALTER TABLE "implementation_packages" ADD CONSTRAINT "implementation_packages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_units" ADD CONSTRAINT "implementation_units_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_units" ADD CONSTRAINT "implementation_units_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "implementation_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_dependencies" ADD CONSTRAINT "implementation_dependencies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_dependencies" ADD CONSTRAINT "implementation_dependencies_from_unit_id_fkey" FOREIGN KEY ("from_unit_id") REFERENCES "implementation_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_dependencies" ADD CONSTRAINT "implementation_dependencies_to_unit_id_fkey" FOREIGN KEY ("to_unit_id") REFERENCES "implementation_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_boundaries" ADD CONSTRAINT "implementation_boundaries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_boundaries" ADD CONSTRAINT "implementation_boundaries_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "implementation_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_evidence" ADD CONSTRAINT "implementation_evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_history" ADD CONSTRAINT "implementation_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_profiles" ADD CONSTRAINT "build_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_profiles" ADD CONSTRAINT "deployment_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
