-- IW-25 SECH Integration (CCP v1.0 Section 11)
-- SECH decision router persistence: one SechRoute per routed decision, recording
-- the 4-gate FIC check sequence (pre_judgment, pre_decision, pre_execution,
-- post_outcome) and its terminal disposition. Gate checks themselves are stored
-- as FicEnforcementCheck rows (IW-23) + IURG events (IW-24). Additive;
-- workspace-scoped only; no FK to FIC/IURG (referenced by value).

-- CreateEnum
CREATE TYPE "SechRouteStatus" AS ENUM ('ROUTING', 'APPROVED', 'REJECTED', 'CONFLICT', 'OVERRIDE', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "sech_routes" (
    "id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "check_type" TEXT,
    "decision_context" TEXT,
    "playbooks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signals" JSONB,
    "status" "SechRouteStatus" NOT NULL DEFAULT 'ROUTING',
    "current_gate" TEXT,
    "final_decision" TEXT,
    "gate_results" JSONB NOT NULL,
    "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "counter_proposal" TEXT,
    "requires_human_approval" BOOLEAN NOT NULL DEFAULT false,
    "override_expires_at" TIMESTAMP(3),
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "outcome_validated" BOOLEAN NOT NULL DEFAULT false,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "trace_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sech_routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sech_routes_route_id_key" ON "sech_routes"("route_id");
CREATE INDEX "sech_routes_workspace_id_status_idx" ON "sech_routes"("workspace_id", "status");
CREATE INDEX "sech_routes_workspace_id_created_at_idx" ON "sech_routes"("workspace_id", "created_at");
CREATE INDEX "sech_routes_route_id_idx" ON "sech_routes"("route_id");

-- AddForeignKey
ALTER TABLE "sech_routes" ADD CONSTRAINT "sech_routes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
