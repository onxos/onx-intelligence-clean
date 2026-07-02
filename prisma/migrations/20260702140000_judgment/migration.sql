-- IW-30 Judgment (HC-10: Knowledge != Judgment)
-- Understanding -> Judgment bridge. A judgment answers "what we should do" from
-- an UnderstandingObject + Founder Intent alignment + FIC constraint check.
-- Climbs preliminary -> validated (DG-09, SC-05 3+ correct) -> institutional
-- (DG-10, SC-06 2+ branches). Additive; workspace-scoped; cross refs plain String.

-- CreateTable
CREATE TABLE "judgment_objects" (
    "id" TEXT NOT NULL,
    "judgment_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "understanding_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "founder_alignment" DOUBLE PRECISION NOT NULL,
    "constraint_check" TEXT NOT NULL,
    "violated_constraints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "reality_tier" TEXT NOT NULL DEFAULT 'speculative',
    "status" TEXT NOT NULL DEFAULT 'preliminary',
    "validation_count" INTEGER NOT NULL DEFAULT 0,
    "incorrect_count" INTEGER NOT NULL DEFAULT 0,
    "validation_branches" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "promoted_approver" TEXT,
    "rule_id" TEXT,
    "related_intents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fic_check_id" TEXT,
    "sech_route_id" TEXT,
    "iurg_node_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "judgment_objects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "judgment_objects_judgment_id_key" ON "judgment_objects"("judgment_id");
CREATE INDEX "judgment_objects_workspace_id_status_idx" ON "judgment_objects"("workspace_id", "status");
CREATE INDEX "judgment_objects_workspace_id_reality_tier_idx" ON "judgment_objects"("workspace_id", "reality_tier");
CREATE INDEX "judgment_objects_workspace_id_understanding_id_idx" ON "judgment_objects"("workspace_id", "understanding_id");
CREATE INDEX "judgment_objects_judgment_id_idx" ON "judgment_objects"("judgment_id");

-- AddForeignKey
ALTER TABLE "judgment_objects" ADD CONSTRAINT "judgment_objects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
