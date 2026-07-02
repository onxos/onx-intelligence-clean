-- IW-24 IURG Full Binding (CCP v1.0 Section 12)
-- Intent-Understanding-Reasoning Graph binding for FIC runtime events.
-- 8 object-type node tables + a generic typed edge table (10 edge types) +
-- the Intent Evolution Ledger. All refs to FIC / intent-compiler are plain
-- String (no FK to those domains); workspace-scoped only. Additive.

-- CreateEnum
CREATE TYPE "IurgEdgeType" AS ENUM ('DERIVED_FROM', 'CONSTRAINS', 'CONFLICTS_WITH', 'SUPERSEDES', 'ENFORCED_BY', 'VIOLATED_BY', 'REVIEWED_UNDER', 'AMENDED_BY', 'VALIDATED_BY', 'REALIZED_AS');

-- CreateTable
CREATE TABLE "iurg_intent_objects" (
    "id" TEXT NOT NULL,
    "iurg_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "intent_ref" TEXT NOT NULL,
    "title" TEXT,
    "category" TEXT,
    "affected_domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iurg_intent_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iurg_constraint_objects" (
    "id" TEXT NOT NULL,
    "iurg_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "constraint_ref" TEXT NOT NULL,
    "kind" TEXT,
    "title" TEXT,
    "source_intent_refs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iurg_constraint_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iurg_conflict_objects" (
    "id" TEXT NOT NULL,
    "iurg_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL DEFAULT 'conflict',
    "intent_id" TEXT,
    "constraint_id" TEXT,
    "conflict_classes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "target_proposal" TEXT,
    "result" TEXT,
    "decision" TEXT,
    "trace_id" TEXT,
    "source_check_id" TEXT,
    "playbooks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iurg_conflict_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iurg_override_objects" (
    "id" TEXT NOT NULL,
    "iurg_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL DEFAULT 'override',
    "intent_id" TEXT,
    "constraint_id" TEXT,
    "override_rules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "target_proposal" TEXT,
    "result" TEXT,
    "decision" TEXT,
    "trace_id" TEXT,
    "source_check_id" TEXT,
    "playbooks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iurg_override_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iurg_review_objects" (
    "id" TEXT NOT NULL,
    "iurg_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL DEFAULT 'review',
    "intent_id" TEXT,
    "decision" TEXT,
    "result" TEXT,
    "target_proposal" TEXT,
    "trace_id" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iurg_review_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iurg_amendment_objects" (
    "id" TEXT NOT NULL,
    "iurg_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL DEFAULT 'amendment',
    "intent_id" TEXT,
    "from_version" INTEGER,
    "to_version" INTEGER,
    "result" TEXT,
    "target_proposal" TEXT,
    "trace_id" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iurg_amendment_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iurg_enforcement_objects" (
    "id" TEXT NOT NULL,
    "iurg_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL DEFAULT 'enforcement',
    "intent_id" TEXT,
    "constraint_id" TEXT,
    "target_proposal" TEXT,
    "result" TEXT,
    "decision" TEXT,
    "trace_id" TEXT,
    "source_check_id" TEXT,
    "playbooks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iurg_enforcement_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iurg_violation_objects" (
    "id" TEXT NOT NULL,
    "iurg_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL DEFAULT 'violation',
    "intent_id" TEXT,
    "constraint_id" TEXT,
    "blocked_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "target_proposal" TEXT,
    "result" TEXT,
    "decision" TEXT,
    "trace_id" TEXT,
    "source_check_id" TEXT,
    "playbooks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iurg_violation_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iurg_edges" (
    "id" TEXT NOT NULL,
    "edge_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "edge_type" "IurgEdgeType" NOT NULL,
    "from_node_type" TEXT NOT NULL,
    "from_node_id" TEXT NOT NULL,
    "from_node_ref" TEXT,
    "to_node_type" TEXT NOT NULL,
    "to_node_id" TEXT NOT NULL,
    "to_node_ref" TEXT,
    "source_event_id" TEXT,
    "source_event_type" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iurg_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intent_evolution_ledger" (
    "id" TEXT NOT NULL,
    "ledger_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "decision" TEXT,
    "intent_id" TEXT,
    "constraint_id" TEXT,
    "node_type" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "trace_id" TEXT,
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intent_evolution_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "iurg_intent_objects_iurg_id_key" ON "iurg_intent_objects"("iurg_id");
CREATE INDEX "iurg_intent_objects_workspace_id_created_at_idx" ON "iurg_intent_objects"("workspace_id", "created_at");
CREATE INDEX "iurg_intent_objects_iurg_id_idx" ON "iurg_intent_objects"("iurg_id");
CREATE UNIQUE INDEX "iurg_intent_objects_workspace_id_intent_ref_key" ON "iurg_intent_objects"("workspace_id", "intent_ref");

-- CreateIndex
CREATE UNIQUE INDEX "iurg_constraint_objects_iurg_id_key" ON "iurg_constraint_objects"("iurg_id");
CREATE INDEX "iurg_constraint_objects_workspace_id_created_at_idx" ON "iurg_constraint_objects"("workspace_id", "created_at");
CREATE INDEX "iurg_constraint_objects_iurg_id_idx" ON "iurg_constraint_objects"("iurg_id");
CREATE UNIQUE INDEX "iurg_constraint_objects_workspace_id_constraint_ref_key" ON "iurg_constraint_objects"("workspace_id", "constraint_ref");

-- CreateIndex
CREATE UNIQUE INDEX "iurg_conflict_objects_iurg_id_key" ON "iurg_conflict_objects"("iurg_id");
CREATE INDEX "iurg_conflict_objects_workspace_id_created_at_idx" ON "iurg_conflict_objects"("workspace_id", "created_at");
CREATE INDEX "iurg_conflict_objects_workspace_id_event_type_idx" ON "iurg_conflict_objects"("workspace_id", "event_type");
CREATE INDEX "iurg_conflict_objects_iurg_id_idx" ON "iurg_conflict_objects"("iurg_id");

-- CreateIndex
CREATE UNIQUE INDEX "iurg_override_objects_iurg_id_key" ON "iurg_override_objects"("iurg_id");
CREATE INDEX "iurg_override_objects_workspace_id_created_at_idx" ON "iurg_override_objects"("workspace_id", "created_at");
CREATE INDEX "iurg_override_objects_workspace_id_event_type_idx" ON "iurg_override_objects"("workspace_id", "event_type");
CREATE INDEX "iurg_override_objects_iurg_id_idx" ON "iurg_override_objects"("iurg_id");

-- CreateIndex
CREATE UNIQUE INDEX "iurg_review_objects_iurg_id_key" ON "iurg_review_objects"("iurg_id");
CREATE INDEX "iurg_review_objects_workspace_id_created_at_idx" ON "iurg_review_objects"("workspace_id", "created_at");
CREATE INDEX "iurg_review_objects_workspace_id_event_type_idx" ON "iurg_review_objects"("workspace_id", "event_type");
CREATE INDEX "iurg_review_objects_iurg_id_idx" ON "iurg_review_objects"("iurg_id");

-- CreateIndex
CREATE UNIQUE INDEX "iurg_amendment_objects_iurg_id_key" ON "iurg_amendment_objects"("iurg_id");
CREATE INDEX "iurg_amendment_objects_workspace_id_created_at_idx" ON "iurg_amendment_objects"("workspace_id", "created_at");
CREATE INDEX "iurg_amendment_objects_workspace_id_event_type_idx" ON "iurg_amendment_objects"("workspace_id", "event_type");
CREATE INDEX "iurg_amendment_objects_iurg_id_idx" ON "iurg_amendment_objects"("iurg_id");

-- CreateIndex
CREATE UNIQUE INDEX "iurg_enforcement_objects_iurg_id_key" ON "iurg_enforcement_objects"("iurg_id");
CREATE INDEX "iurg_enforcement_objects_workspace_id_created_at_idx" ON "iurg_enforcement_objects"("workspace_id", "created_at");
CREATE INDEX "iurg_enforcement_objects_workspace_id_event_type_idx" ON "iurg_enforcement_objects"("workspace_id", "event_type");
CREATE INDEX "iurg_enforcement_objects_iurg_id_idx" ON "iurg_enforcement_objects"("iurg_id");

-- CreateIndex
CREATE UNIQUE INDEX "iurg_violation_objects_iurg_id_key" ON "iurg_violation_objects"("iurg_id");
CREATE INDEX "iurg_violation_objects_workspace_id_created_at_idx" ON "iurg_violation_objects"("workspace_id", "created_at");
CREATE INDEX "iurg_violation_objects_workspace_id_event_type_idx" ON "iurg_violation_objects"("workspace_id", "event_type");
CREATE INDEX "iurg_violation_objects_iurg_id_idx" ON "iurg_violation_objects"("iurg_id");

-- CreateIndex
CREATE UNIQUE INDEX "iurg_edges_edge_id_key" ON "iurg_edges"("edge_id");
CREATE INDEX "iurg_edges_workspace_id_from_node_id_idx" ON "iurg_edges"("workspace_id", "from_node_id");
CREATE INDEX "iurg_edges_workspace_id_to_node_id_idx" ON "iurg_edges"("workspace_id", "to_node_id");
CREATE INDEX "iurg_edges_workspace_id_edge_type_idx" ON "iurg_edges"("workspace_id", "edge_type");
CREATE INDEX "iurg_edges_edge_id_idx" ON "iurg_edges"("edge_id");

-- CreateIndex
CREATE UNIQUE INDEX "intent_evolution_ledger_ledger_id_key" ON "intent_evolution_ledger"("ledger_id");
CREATE INDEX "intent_evolution_ledger_workspace_id_created_at_idx" ON "intent_evolution_ledger"("workspace_id", "created_at");
CREATE INDEX "intent_evolution_ledger_ledger_id_idx" ON "intent_evolution_ledger"("ledger_id");
CREATE UNIQUE INDEX "intent_evolution_ledger_workspace_id_sequence_key" ON "intent_evolution_ledger"("workspace_id", "sequence");

-- AddForeignKey
ALTER TABLE "iurg_intent_objects" ADD CONSTRAINT "iurg_intent_objects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "iurg_constraint_objects" ADD CONSTRAINT "iurg_constraint_objects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "iurg_conflict_objects" ADD CONSTRAINT "iurg_conflict_objects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "iurg_override_objects" ADD CONSTRAINT "iurg_override_objects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "iurg_review_objects" ADD CONSTRAINT "iurg_review_objects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "iurg_amendment_objects" ADD CONSTRAINT "iurg_amendment_objects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "iurg_enforcement_objects" ADD CONSTRAINT "iurg_enforcement_objects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "iurg_violation_objects" ADD CONSTRAINT "iurg_violation_objects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "iurg_edges" ADD CONSTRAINT "iurg_edges_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "intent_evolution_ledger" ADD CONSTRAINT "intent_evolution_ledger_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
