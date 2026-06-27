-- CreateEnum
CREATE TYPE "MemoryAccessScope" AS ENUM ('WORKSPACE', 'OWNER_ONLY');

-- CreateEnum
CREATE TYPE "MemoryLifecycleStatus" AS ENUM ('ACTIVE', 'LOCKED', 'EXPIRED');

-- AlterTable
ALTER TABLE "memory_entries"
ADD COLUMN "classification" "PrivacyLevel" NOT NULL DEFAULT 'INSTITUTIONAL',
ADD COLUMN "access_scope" "MemoryAccessScope" NOT NULL DEFAULT 'WORKSPACE',
ADD COLUMN "lifecycle_status" "MemoryLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "retention_days" INTEGER NOT NULL DEFAULT 1095,
ADD COLUMN "expires_at" TIMESTAMP(3);

-- Backfill existing rows with governance defaults.
UPDATE "memory_entries"
SET
  "classification" = COALESCE("classification", 'INSTITUTIONAL'),
  "access_scope" = COALESCE("access_scope", 'WORKSPACE'),
  "lifecycle_status" = CASE
    WHEN "deleted_at" IS NOT NULL THEN 'EXPIRED'::"MemoryLifecycleStatus"
    ELSE COALESCE("lifecycle_status", 'ACTIVE')
  END,
  "retention_days" = COALESCE("retention_days", 1095),
  "expires_at" = COALESCE("expires_at", "created_at" + INTERVAL '1095 days');

ALTER TABLE "memory_entries"
ALTER COLUMN "expires_at" SET NOT NULL;

-- Indexes
CREATE INDEX "memory_entries_workspace_id_deleted_at_lifecycle_status_idx"
ON "memory_entries"("workspace_id", "deleted_at", "lifecycle_status");

CREATE INDEX "memory_entries_workspace_id_owner_id_access_scope_idx"
ON "memory_entries"("workspace_id", "owner_id", "access_scope");
