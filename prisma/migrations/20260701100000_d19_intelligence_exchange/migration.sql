-- IW-10 — D19 Intelligence Exchange Architecture
-- Additive only. Build-only on D11/D12/D13/D16/FIC/IUC/D17/D18.
-- No destructive modification of prior tables. Backward compatible.

-- CreateEnum
CREATE TYPE "ExchangeSessionState" AS ENUM ('OPEN', 'ACTIVE', 'SUSPENDED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExchangeStage" AS ENUM ('INTEND', 'COMPREHEND', 'VALIDATE', 'TRANSFER', 'VERIFY', 'LINEAGE', 'MEASURE', 'CAPITALIZE', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "ExchangeTransactionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ROLLED_BACK', 'REPLAYED');

-- CreateEnum
CREATE TYPE "ExchangeOwnershipClass" AS ENUM ('FOUNDER', 'WORKSPACE', 'AGENT', 'RUNTIME', 'KNOWLEDGE', 'CAPITAL', 'SHARED');

-- CreateEnum
CREATE TYPE "ExchangeVerificationState" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExchangeValidationState" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExchangeMessageType" AS ENUM ('REQUEST', 'RESPONSE', 'EVENT', 'RECEIPT', 'ERROR');

-- CreateEnum
CREATE TYPE "ExchangeReceiptStatus" AS ENUM ('ISSUED', 'ACKNOWLEDGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExchangeAuditOutcome" AS ENUM ('PASS', 'FAIL', 'WARN');

-- CreateEnum
CREATE TYPE "ExchangeEventType" AS ENUM ('SESSION_CREATED', 'SESSION_UPDATED', 'TRANSACTION_CREATED', 'STAGE_ADVANCED', 'MESSAGE_SENT', 'ENVELOPE_SEALED', 'RECEIPT_ISSUED', 'VALIDATED', 'TRANSFERRED', 'VERIFIED', 'LINEAGE_RECORDED', 'MEASURED', 'CAPITALIZED', 'COMPLETED', 'FAILED', 'ROLLED_BACK', 'REPLAYED', 'POLICY_SET');

-- CreateTable
CREATE TABLE "exchange_sessions" (
    "id" TEXT NOT NULL,
    "exchange_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "ownership_class" "ExchangeOwnershipClass" NOT NULL DEFAULT 'WORKSPACE',
    "state" "ExchangeSessionState" NOT NULL DEFAULT 'OPEN',
    "authority" "AuthorityLevel" NOT NULL DEFAULT 'OPERATIONAL',
    "transaction_seq" INTEGER NOT NULL DEFAULT 0,
    "event_seq" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "exchange_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_transactions" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "description" TEXT,
    "stage" "ExchangeStage" NOT NULL DEFAULT 'INTEND',
    "previous_stage" "ExchangeStage",
    "status" "ExchangeTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "ownership_class" "ExchangeOwnershipClass" NOT NULL DEFAULT 'WORKSPACE',
    "origin" TEXT,
    "destination" TEXT,
    "parent_transaction_id" TEXT,
    "source_object_id" TEXT,
    "source_object_type" TEXT,
    "target_object_id" TEXT,
    "target_object_type" TEXT,
    "authority" "AuthorityLevel" NOT NULL DEFAULT 'OPERATIONAL',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "verification" "ExchangeVerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "provenance" TEXT,
    "integrity_hash" TEXT,
    "integrity_verified" BOOLEAN NOT NULL DEFAULT false,
    "traceable" BOOLEAN NOT NULL DEFAULT true,
    "trust_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validation_state" "ExchangeValidationState" NOT NULL DEFAULT 'PENDING',
    "stage_seq" INTEGER NOT NULL DEFAULT 0,
    "event_seq" INTEGER NOT NULL DEFAULT 0,
    "replay_count" INTEGER NOT NULL DEFAULT 0,
    "rolled_back" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "exchange_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_envelopes" (
    "id" TEXT NOT NULL,
    "envelope_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "content_type" TEXT NOT NULL DEFAULT 'application/json',
    "checksum" TEXT NOT NULL,
    "sealed" BOOLEAN NOT NULL DEFAULT true,
    "ownership_class" "ExchangeOwnershipClass" NOT NULL DEFAULT 'WORKSPACE',
    "authority" "AuthorityLevel" NOT NULL DEFAULT 'OPERATIONAL',
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "sealed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_envelopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_messages" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "message_type" "ExchangeMessageType" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stage" "ExchangeStage" NOT NULL,
    "from_party" TEXT,
    "to_party" TEXT,
    "body" TEXT,
    "payload" JSONB,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_receipts" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "status" "ExchangeReceiptStatus" NOT NULL DEFAULT 'ISSUED',
    "stage" "ExchangeStage" NOT NULL,
    "trust_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "verification" "ExchangeVerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "issued_to" TEXT,
    "notes" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_audits" (
    "id" TEXT NOT NULL,
    "audit_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "outcome" "ExchangeAuditOutcome" NOT NULL,
    "stage" "ExchangeStage",
    "detail" TEXT,
    "score" DOUBLE PRECISION,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_history" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "event_type" "ExchangeEventType" NOT NULL,
    "from_stage" "ExchangeStage",
    "to_stage" "ExchangeStage",
    "reference_id" TEXT,
    "notes" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_policies" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "policy_type" TEXT NOT NULL,
    "rules" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "authority" "AuthorityLevel" NOT NULL DEFAULT 'OPERATIONAL',
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "exchange_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_lineage" (
    "id" TEXT NOT NULL,
    "lineage_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "origin" TEXT,
    "destination" TEXT,
    "parent_transaction_id" TEXT,
    "child_transaction_id" TEXT,
    "source_object_id" TEXT,
    "source_object_type" TEXT,
    "target_object_id" TEXT,
    "target_object_type" TEXT,
    "execution_chain" JSONB,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_lineage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_contexts" (
    "id" TEXT NOT NULL,
    "context_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "transaction_id" TEXT,
    "workspace_id" TEXT NOT NULL,
    "context_type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "payload" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "exchange_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exchange_sessions_exchange_id_key" ON "exchange_sessions"("exchange_id");
CREATE INDEX "exchange_sessions_workspace_id_deleted_at_state_idx" ON "exchange_sessions"("workspace_id", "deleted_at", "state");
CREATE INDEX "exchange_sessions_workspace_id_created_at_idx" ON "exchange_sessions"("workspace_id", "created_at");
CREATE INDEX "exchange_sessions_exchange_id_idx" ON "exchange_sessions"("exchange_id");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_transactions_transaction_id_key" ON "exchange_transactions"("transaction_id");
CREATE INDEX "exchange_transactions_session_id_deleted_at_stage_idx" ON "exchange_transactions"("session_id", "deleted_at", "stage");
CREATE INDEX "exchange_transactions_workspace_id_deleted_at_stage_idx" ON "exchange_transactions"("workspace_id", "deleted_at", "stage");
CREATE INDEX "exchange_transactions_workspace_id_status_created_at_idx" ON "exchange_transactions"("workspace_id", "status", "created_at");
CREATE INDEX "exchange_transactions_parent_transaction_id_idx" ON "exchange_transactions"("parent_transaction_id");
CREATE INDEX "exchange_transactions_transaction_id_idx" ON "exchange_transactions"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_envelopes_envelope_id_key" ON "exchange_envelopes"("envelope_id");
CREATE INDEX "exchange_envelopes_transaction_id_created_at_idx" ON "exchange_envelopes"("transaction_id", "created_at");
CREATE INDEX "exchange_envelopes_workspace_id_created_at_idx" ON "exchange_envelopes"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_messages_message_id_key" ON "exchange_messages"("message_id");
CREATE INDEX "exchange_messages_transaction_id_sequence_idx" ON "exchange_messages"("transaction_id", "sequence");
CREATE INDEX "exchange_messages_workspace_id_created_at_idx" ON "exchange_messages"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_receipts_receipt_id_key" ON "exchange_receipts"("receipt_id");
CREATE INDEX "exchange_receipts_transaction_id_created_at_idx" ON "exchange_receipts"("transaction_id", "created_at");
CREATE INDEX "exchange_receipts_workspace_id_created_at_idx" ON "exchange_receipts"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_audits_audit_id_key" ON "exchange_audits"("audit_id");
CREATE INDEX "exchange_audits_transaction_id_created_at_idx" ON "exchange_audits"("transaction_id", "created_at");
CREATE INDEX "exchange_audits_workspace_id_dimension_created_at_idx" ON "exchange_audits"("workspace_id", "dimension", "created_at");

-- CreateIndex
CREATE INDEX "exchange_history_session_id_created_at_idx" ON "exchange_history"("session_id", "created_at");
CREATE INDEX "exchange_history_transaction_id_created_at_idx" ON "exchange_history"("transaction_id", "created_at");
CREATE INDEX "exchange_history_workspace_id_event_type_created_at_idx" ON "exchange_history"("workspace_id", "event_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_policies_policy_id_key" ON "exchange_policies"("policy_id");
CREATE INDEX "exchange_policies_session_id_deleted_at_idx" ON "exchange_policies"("session_id", "deleted_at");
CREATE INDEX "exchange_policies_workspace_id_policy_type_created_at_idx" ON "exchange_policies"("workspace_id", "policy_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_lineage_lineage_id_key" ON "exchange_lineage"("lineage_id");
CREATE INDEX "exchange_lineage_transaction_id_created_at_idx" ON "exchange_lineage"("transaction_id", "created_at");
CREATE INDEX "exchange_lineage_parent_transaction_id_idx" ON "exchange_lineage"("parent_transaction_id");
CREATE INDEX "exchange_lineage_workspace_id_created_at_idx" ON "exchange_lineage"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_contexts_context_id_key" ON "exchange_contexts"("context_id");
CREATE INDEX "exchange_contexts_session_id_deleted_at_context_type_idx" ON "exchange_contexts"("session_id", "deleted_at", "context_type");
CREATE INDEX "exchange_contexts_workspace_id_created_at_idx" ON "exchange_contexts"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "exchange_sessions" ADD CONSTRAINT "exchange_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_transactions" ADD CONSTRAINT "exchange_transactions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exchange_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exchange_transactions" ADD CONSTRAINT "exchange_transactions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_envelopes" ADD CONSTRAINT "exchange_envelopes_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "exchange_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exchange_envelopes" ADD CONSTRAINT "exchange_envelopes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exchange_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exchange_envelopes" ADD CONSTRAINT "exchange_envelopes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_messages" ADD CONSTRAINT "exchange_messages_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "exchange_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exchange_messages" ADD CONSTRAINT "exchange_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exchange_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exchange_messages" ADD CONSTRAINT "exchange_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_receipts" ADD CONSTRAINT "exchange_receipts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "exchange_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exchange_receipts" ADD CONSTRAINT "exchange_receipts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exchange_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exchange_receipts" ADD CONSTRAINT "exchange_receipts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_audits" ADD CONSTRAINT "exchange_audits_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "exchange_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exchange_audits" ADD CONSTRAINT "exchange_audits_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exchange_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exchange_audits" ADD CONSTRAINT "exchange_audits_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_history" ADD CONSTRAINT "exchange_history_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "exchange_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exchange_history" ADD CONSTRAINT "exchange_history_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exchange_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exchange_history" ADD CONSTRAINT "exchange_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_policies" ADD CONSTRAINT "exchange_policies_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exchange_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exchange_policies" ADD CONSTRAINT "exchange_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_lineage" ADD CONSTRAINT "exchange_lineage_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "exchange_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exchange_lineage" ADD CONSTRAINT "exchange_lineage_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exchange_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exchange_lineage" ADD CONSTRAINT "exchange_lineage_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_contexts" ADD CONSTRAINT "exchange_contexts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exchange_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exchange_contexts" ADD CONSTRAINT "exchange_contexts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "exchange_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exchange_contexts" ADD CONSTRAINT "exchange_contexts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
