-- Phase 1 — AI Integration Core
-- Immutable log of every constitutional AI model invocation. Additive,
-- workspace-scoped; FIC/SECH/IURG references are plain String (bound by value).

-- CreateTable
CREATE TABLE "ai_query_logs" (
    "id" TEXT NOT NULL,
    "query_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "provider_used" TEXT NOT NULL,
    "model_used" TEXT NOT NULL,
    "response" TEXT,
    "tokens_used" INTEGER NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "evidence_tier" TEXT NOT NULL,
    "fic_status" TEXT NOT NULL,
    "fic_check_id" TEXT,
    "sech_route_id" TEXT,
    "iurg_node_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_query_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_query_logs_query_id_key" ON "ai_query_logs"("query_id");
CREATE INDEX "ai_query_logs_workspace_id_created_at_idx" ON "ai_query_logs"("workspace_id", "created_at");
CREATE INDEX "ai_query_logs_workspace_id_domain_idx" ON "ai_query_logs"("workspace_id", "domain");
CREATE INDEX "ai_query_logs_workspace_id_fic_status_idx" ON "ai_query_logs"("workspace_id", "fic_status");

-- AddForeignKey
ALTER TABLE "ai_query_logs" ADD CONSTRAINT "ai_query_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
