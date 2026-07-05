-- Atlas V7: Continuous Evolution — Schema Intelligence Extensions
-- Adds schema evolution tracking, table/column analytics for the Zeus
-- auto-optimizer, and a corpus document store for the ingestion engine.

-- CreateEnum
CREATE TYPE "IntelligenceDomain" AS ENUM (
    'CLINICAL', 'FINANCIAL', 'OPERATIONAL', 'GOVERNANCE', 'STRATEGIC',
    'ARCHITECTURAL', 'RESEARCH', 'COMPLIANCE', 'SECURITY', 'PERFORMANCE',
    'USER_BEHAVIOR', 'MARKET', 'TECHNOLOGY', 'ENVIRONMENTAL', 'SOCIAL'
);

-- CreateTable
CREATE TABLE "schema_evolution_log" (
    "id" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "column_name" TEXT NOT NULL,
    "change_type" TEXT NOT NULL,
    "old_definition" JSONB,
    "new_definition" JSONB,
    "migration_script" TEXT,
    "applied_by" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schema_evolution_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_statistics" (
    "id" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "avg_query_time_ms" DECIMAL(10,2),
    "index_hit_ratio" DECIMAL(5,4),
    "last_vacuumed" TIMESTAMP(3),
    "last_analyzed" TIMESTAMP(3),
    "workspace_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_statistics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "column_analytics" (
    "id" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "column_name" TEXT NOT NULL,
    "null_percentage" DECIMAL(5,2),
    "distinct_ratio" DECIMAL(5,4),
    "avg_value_size" INTEGER,
    "query_frequency" INTEGER NOT NULL DEFAULT 0,
    "workspace_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "column_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corpus_documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "domain" "IntelligenceDomain" NOT NULL DEFAULT 'OPERATIONAL',
    "metadata" JSONB,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corpus_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schema_evolution_log_workspace_id_idx" ON "schema_evolution_log"("workspace_id");
CREATE INDEX "schema_evolution_log_table_name_idx" ON "schema_evolution_log"("table_name");
CREATE INDEX "schema_evolution_log_change_type_idx" ON "schema_evolution_log"("change_type");
CREATE INDEX "schema_evolution_log_created_at_idx" ON "schema_evolution_log"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "table_statistics_workspace_id_table_name_key" ON "table_statistics"("workspace_id", "table_name");
CREATE INDEX "table_statistics_workspace_id_idx" ON "table_statistics"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "column_analytics_workspace_id_table_name_column_name_key" ON "column_analytics"("workspace_id", "table_name", "column_name");
CREATE INDEX "column_analytics_workspace_id_idx" ON "column_analytics"("workspace_id");

-- CreateIndex
CREATE INDEX "corpus_documents_workspace_id_idx" ON "corpus_documents"("workspace_id");
CREATE INDEX "corpus_documents_domain_idx" ON "corpus_documents"("domain");
CREATE INDEX "corpus_documents_source_id_idx" ON "corpus_documents"("source_id");
