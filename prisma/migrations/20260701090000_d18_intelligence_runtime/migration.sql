-- IW-09 — D18 Intelligence Runtime Architecture
-- Additive only. Build-only on D11/D12/D13/D16/FIC/IUC/D17.
-- No destructive modification of prior tables. Backward compatible.

-- CreateEnum
CREATE TYPE "RuntimeSessionState" AS ENUM ('CREATED', 'INITIALIZING', 'READY', 'RUNNING', 'WAITING', 'PAUSED', 'RECOVERING', 'DEGRADED', 'FAILED', 'STOPPING', 'STOPPED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RuntimeHealthStatus" AS ENUM ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNHEALTHY');

-- CreateEnum
CREATE TYPE "RuntimeContextType" AS ENUM ('EXECUTION', 'KNOWLEDGE', 'LEARNING', 'CAPITAL', 'MEASUREMENT', 'INTENT', 'WORKSPACE', 'PROVIDER', 'MEMORY');

-- CreateEnum
CREATE TYPE "RuntimeEventType" AS ENUM ('SESSION_CREATED', 'STATE_TRANSITION', 'CONTEXT_ATTACHED', 'CHECKPOINT_CREATED', 'CHECKPOINT_RESTORED', 'SNAPSHOT_CREATED', 'RECOVERY_STARTED', 'RECOVERY_COMPLETED', 'ROLLBACK', 'HEARTBEAT', 'RESUMED', 'ERROR');

-- CreateEnum
CREATE TYPE "RuntimeHistoryEventType" AS ENUM ('SESSION_CREATED', 'STATE_TRANSITION', 'CONTEXT_ATTACHED', 'CHECKPOINT_CREATED', 'CHECKPOINT_RESTORED', 'SNAPSHOT_CREATED', 'RECOVERY', 'ROLLBACK', 'POLICY_SET', 'RESUMED', 'HEALTH_CHECK');

-- CreateEnum
CREATE TYPE "RuntimeCheckpointType" AS ENUM ('MANUAL', 'AUTOMATIC', 'PRE_RECOVERY', 'PRE_ROLLBACK', 'MILESTONE');

-- CreateEnum
CREATE TYPE "RuntimeRecoveryType" AS ENUM ('CHECKPOINT_RESTORE', 'RUNTIME_ROLLBACK', 'CRASH_RECOVERY', 'CONTINUITY_RECOVERY', 'SESSION_RESUME');

-- CreateEnum
CREATE TYPE "RuntimeRecoveryStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "runtime_sessions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "state" "RuntimeSessionState" NOT NULL DEFAULT 'CREATED',
    "previous_state" "RuntimeSessionState",
    "health_status" "RuntimeHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "authority" "AuthorityLevel" NOT NULL DEFAULT 'OPERATIONAL',
    "lineage_root" TEXT,
    "parent_session_id" TEXT,
    "continuity_seq" INTEGER NOT NULL DEFAULT 0,
    "event_seq" INTEGER NOT NULL DEFAULT 0,
    "recovery_count" INTEGER NOT NULL DEFAULT 0,
    "last_checkpoint_id" TEXT,
    "last_heartbeat_at" TIMESTAMP(3),
    "state_entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "runtime_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runtime_states" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "from_state" "RuntimeSessionState",
    "to_state" "RuntimeSessionState" NOT NULL,
    "reason" TEXT,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runtime_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runtime_contexts" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "context_type" "RuntimeContextType" NOT NULL,
    "key" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "payload" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "runtime_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runtime_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "event_type" "RuntimeEventType" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "state" "RuntimeSessionState",
    "description" TEXT,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "payload" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runtime_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runtime_checkpoints" (
    "id" TEXT NOT NULL,
    "checkpoint_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "checkpoint_type" "RuntimeCheckpointType" NOT NULL DEFAULT 'MANUAL',
    "label" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "captured_state" "RuntimeSessionState" NOT NULL,
    "health_status" "RuntimeHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "context_snapshot" JSONB,
    "context_count" INTEGER NOT NULL DEFAULT 0,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "runtime_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runtime_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "checkpoint_id" TEXT,
    "label" TEXT NOT NULL,
    "state" "RuntimeSessionState" NOT NULL,
    "payload" JSONB NOT NULL,
    "context_count" INTEGER NOT NULL DEFAULT 0,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runtime_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runtime_recoveries" (
    "id" TEXT NOT NULL,
    "recovery_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "checkpoint_id" TEXT,
    "recovery_type" "RuntimeRecoveryType" NOT NULL,
    "status" "RuntimeRecoveryStatus" NOT NULL DEFAULT 'PENDING',
    "from_state" "RuntimeSessionState",
    "to_state" "RuntimeSessionState",
    "reason" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "runtime_recoveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runtime_history" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "event_type" "RuntimeHistoryEventType" NOT NULL,
    "from_state" "RuntimeSessionState",
    "to_state" "RuntimeSessionState",
    "health_status" "RuntimeHealthStatus",
    "reference_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runtime_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runtime_policies" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "policy_type" TEXT NOT NULL,
    "rules" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "authority" "AuthorityLevel" NOT NULL DEFAULT 'OPERATIONAL',
    "actor_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "runtime_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "runtime_sessions_session_id_key" ON "runtime_sessions"("session_id");

-- CreateIndex
CREATE INDEX "runtime_sessions_workspace_id_deleted_at_state_idx" ON "runtime_sessions"("workspace_id", "deleted_at", "state");

-- CreateIndex
CREATE INDEX "runtime_sessions_workspace_id_health_status_created_at_idx" ON "runtime_sessions"("workspace_id", "health_status", "created_at");

-- CreateIndex
CREATE INDEX "runtime_sessions_lineage_root_idx" ON "runtime_sessions"("lineage_root");

-- CreateIndex
CREATE INDEX "runtime_sessions_session_id_idx" ON "runtime_sessions"("session_id");

-- CreateIndex
CREATE INDEX "runtime_states_session_id_created_at_idx" ON "runtime_states"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "runtime_states_workspace_id_created_at_idx" ON "runtime_states"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "runtime_contexts_session_id_deleted_at_context_type_idx" ON "runtime_contexts"("session_id", "deleted_at", "context_type");

-- CreateIndex
CREATE INDEX "runtime_contexts_workspace_id_created_at_idx" ON "runtime_contexts"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "runtime_events_session_id_sequence_idx" ON "runtime_events"("session_id", "sequence");

-- CreateIndex
CREATE INDEX "runtime_events_workspace_id_event_type_created_at_idx" ON "runtime_events"("workspace_id", "event_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "runtime_checkpoints_checkpoint_id_key" ON "runtime_checkpoints"("checkpoint_id");

-- CreateIndex
CREATE INDEX "runtime_checkpoints_session_id_deleted_at_sequence_idx" ON "runtime_checkpoints"("session_id", "deleted_at", "sequence");

-- CreateIndex
CREATE INDEX "runtime_checkpoints_workspace_id_created_at_idx" ON "runtime_checkpoints"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "runtime_snapshots_snapshot_id_key" ON "runtime_snapshots"("snapshot_id");

-- CreateIndex
CREATE INDEX "runtime_snapshots_session_id_created_at_idx" ON "runtime_snapshots"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "runtime_snapshots_workspace_id_created_at_idx" ON "runtime_snapshots"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "runtime_recoveries_recovery_id_key" ON "runtime_recoveries"("recovery_id");

-- CreateIndex
CREATE INDEX "runtime_recoveries_session_id_created_at_idx" ON "runtime_recoveries"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "runtime_recoveries_workspace_id_recovery_type_created_at_idx" ON "runtime_recoveries"("workspace_id", "recovery_type", "created_at");

-- CreateIndex
CREATE INDEX "runtime_history_session_id_created_at_idx" ON "runtime_history"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "runtime_history_workspace_id_event_type_created_at_idx" ON "runtime_history"("workspace_id", "event_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "runtime_policies_policy_id_key" ON "runtime_policies"("policy_id");

-- CreateIndex
CREATE INDEX "runtime_policies_session_id_deleted_at_idx" ON "runtime_policies"("session_id", "deleted_at");

-- CreateIndex
CREATE INDEX "runtime_policies_workspace_id_policy_type_created_at_idx" ON "runtime_policies"("workspace_id", "policy_type", "created_at");

-- AddForeignKey
ALTER TABLE "runtime_sessions" ADD CONSTRAINT "runtime_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_states" ADD CONSTRAINT "runtime_states_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "runtime_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_states" ADD CONSTRAINT "runtime_states_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_contexts" ADD CONSTRAINT "runtime_contexts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "runtime_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_contexts" ADD CONSTRAINT "runtime_contexts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_events" ADD CONSTRAINT "runtime_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "runtime_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_events" ADD CONSTRAINT "runtime_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_checkpoints" ADD CONSTRAINT "runtime_checkpoints_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "runtime_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_checkpoints" ADD CONSTRAINT "runtime_checkpoints_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_snapshots" ADD CONSTRAINT "runtime_snapshots_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "runtime_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_snapshots" ADD CONSTRAINT "runtime_snapshots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_recoveries" ADD CONSTRAINT "runtime_recoveries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "runtime_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_recoveries" ADD CONSTRAINT "runtime_recoveries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_recoveries" ADD CONSTRAINT "runtime_recoveries_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "runtime_checkpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_history" ADD CONSTRAINT "runtime_history_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "runtime_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_history" ADD CONSTRAINT "runtime_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_policies" ADD CONSTRAINT "runtime_policies_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "runtime_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_policies" ADD CONSTRAINT "runtime_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
