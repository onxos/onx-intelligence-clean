-- IW-29 Perception -> Understanding Integration (HC-10)
-- The 3-transformation bridge (T1 Pattern Detection SC-05 / T2 Context Matching
-- SC-08 / T3 Meaning Extraction HC-10). Each stage passes the SECH pre_judgment
-- gate and links into IURG. Additive; workspace-scoped; cross-stage refs plain
-- String (no FK).

-- CreateTable
CREATE TABLE "detected_patterns" (
    "id" TEXT NOT NULL,
    "pattern_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "perception_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "domain" TEXT NOT NULL,
    "pattern_type" TEXT NOT NULL,
    "occurrence_count" INTEGER NOT NULL,
    "first_seen" TIMESTAMP(3) NOT NULL,
    "last_seen" TIMESTAMP(3) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "status" TEXT NOT NULL DEFAULT 'detected',
    "reason" TEXT,
    "fic_check_id" TEXT,
    "sech_route_id" TEXT,
    "iurg_node_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detected_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contextualized_patterns" (
    "id" TEXT NOT NULL,
    "context_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "pattern_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "matched_contexts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_count" INTEGER NOT NULL,
    "interpretation" TEXT,
    "enriched_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "status" TEXT NOT NULL DEFAULT 'contextualized',
    "reason" TEXT,
    "fic_check_id" TEXT,
    "sech_route_id" TEXT,
    "iurg_node_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contextualized_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "understanding_objects" (
    "id" TEXT NOT NULL,
    "understanding_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "context_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "evidence_basis" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "reality_tier" TEXT NOT NULL,
    "related_intents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'preliminary',
    "reason" TEXT,
    "fic_check_id" TEXT,
    "sech_route_id" TEXT,
    "iurg_node_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "understanding_objects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "detected_patterns_pattern_id_key" ON "detected_patterns"("pattern_id");
CREATE INDEX "detected_patterns_workspace_id_domain_idx" ON "detected_patterns"("workspace_id", "domain");
CREATE INDEX "detected_patterns_workspace_id_pattern_type_idx" ON "detected_patterns"("workspace_id", "pattern_type");
CREATE INDEX "detected_patterns_workspace_id_status_idx" ON "detected_patterns"("workspace_id", "status");
CREATE INDEX "detected_patterns_pattern_id_idx" ON "detected_patterns"("pattern_id");

-- CreateIndex
CREATE UNIQUE INDEX "contextualized_patterns_context_id_key" ON "contextualized_patterns"("context_id");
CREATE INDEX "contextualized_patterns_workspace_id_pattern_id_idx" ON "contextualized_patterns"("workspace_id", "pattern_id");
CREATE INDEX "contextualized_patterns_workspace_id_status_idx" ON "contextualized_patterns"("workspace_id", "status");
CREATE INDEX "contextualized_patterns_context_id_idx" ON "contextualized_patterns"("context_id");

-- CreateIndex
CREATE UNIQUE INDEX "understanding_objects_understanding_id_key" ON "understanding_objects"("understanding_id");
CREATE INDEX "understanding_objects_workspace_id_reality_tier_idx" ON "understanding_objects"("workspace_id", "reality_tier");
CREATE INDEX "understanding_objects_workspace_id_status_idx" ON "understanding_objects"("workspace_id", "status");
CREATE INDEX "understanding_objects_understanding_id_idx" ON "understanding_objects"("understanding_id");

-- AddForeignKey
ALTER TABLE "detected_patterns" ADD CONSTRAINT "detected_patterns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contextualized_patterns" ADD CONSTRAINT "contextualized_patterns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "understanding_objects" ADD CONSTRAINT "understanding_objects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
