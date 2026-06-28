-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ALLOCATED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AllocationApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "capital_allocations" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "policy_id" TEXT,
  "category" "CapitalCategory" NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "source" TEXT,
  "target" TEXT,
  "status" "AllocationStatus" NOT NULL DEFAULT 'DRAFT',
  "priority" INTEGER NOT NULL DEFAULT 3,
  "rationale" TEXT,
  "decision_reason" TEXT,
  "approval_status" "AllocationApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "capital_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocation_policies" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" "CapitalCategory" NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "source" TEXT,
  "target" TEXT,
  "status" "PolicyStatus" NOT NULL DEFAULT 'ACTIVE',
  "priority" INTEGER NOT NULL DEFAULT 3,
  "rationale" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "allocation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocation_decisions" (
  "id" TEXT NOT NULL,
  "allocation_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "status" "AllocationStatus" NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 3,
  "rationale" TEXT,
  "decision_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "allocation_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocation_approvals" (
  "id" TEXT NOT NULL,
  "allocation_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "approval_status" "AllocationApprovalStatus" NOT NULL,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "decision_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "allocation_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocation_histories" (
  "id" TEXT NOT NULL,
  "allocation_id" TEXT,
  "policy_id" TEXT,
  "workspace_id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "status" TEXT,
  "rationale" TEXT,
  "decision_reason" TEXT,
  "previous_state" JSONB,
  "next_state" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "allocation_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "capital_allocations_workspace_id_deleted_at_status_idx" ON "capital_allocations"("workspace_id", "deleted_at", "status");

-- CreateIndex
CREATE INDEX "capital_allocations_workspace_id_category_created_at_idx" ON "capital_allocations"("workspace_id", "category", "created_at");

-- CreateIndex
CREATE INDEX "allocation_policies_workspace_id_deleted_at_status_idx" ON "allocation_policies"("workspace_id", "deleted_at", "status");

-- CreateIndex
CREATE INDEX "allocation_policies_workspace_id_category_created_at_idx" ON "allocation_policies"("workspace_id", "category", "created_at");

-- CreateIndex
CREATE INDEX "allocation_decisions_workspace_id_allocation_id_created_at_idx" ON "allocation_decisions"("workspace_id", "allocation_id", "created_at");

-- CreateIndex
CREATE INDEX "allocation_approvals_workspace_id_allocation_id_created_at_idx" ON "allocation_approvals"("workspace_id", "allocation_id", "created_at");

-- CreateIndex
CREATE INDEX "allocation_histories_workspace_id_created_at_idx" ON "allocation_histories"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "allocation_histories_allocation_id_created_at_idx" ON "allocation_histories"("allocation_id", "created_at");

-- CreateIndex
CREATE INDEX "allocation_histories_policy_id_created_at_idx" ON "allocation_histories"("policy_id", "created_at");

-- AddForeignKey
ALTER TABLE "capital_allocations" ADD CONSTRAINT "capital_allocations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_allocations" ADD CONSTRAINT "capital_allocations_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "allocation_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_policies" ADD CONSTRAINT "allocation_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_decisions" ADD CONSTRAINT "allocation_decisions_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "capital_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_decisions" ADD CONSTRAINT "allocation_decisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_approvals" ADD CONSTRAINT "allocation_approvals_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "capital_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_approvals" ADD CONSTRAINT "allocation_approvals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_histories" ADD CONSTRAINT "allocation_histories_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "capital_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_histories" ADD CONSTRAINT "allocation_histories_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "allocation_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_histories" ADD CONSTRAINT "allocation_histories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;