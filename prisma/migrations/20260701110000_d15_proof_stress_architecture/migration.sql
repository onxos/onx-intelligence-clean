-- CreateEnum
CREATE TYPE "ProofSessionState" AS ENUM ('OPEN', 'ACTIVE', 'CERTIFIED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProofExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'ERROR');

-- CreateEnum
CREATE TYPE "CertificationGate" AS ENUM ('KNOWLEDGE_INTEGRITY', 'MEMORY_INTEGRITY', 'RUNTIME_INTEGRITY', 'EXCHANGE_INTEGRITY', 'CAPITAL_INTEGRITY', 'MEASUREMENT_INTEGRITY', 'GOVERNANCE_INTEGRITY', 'AUDIT_INTEGRITY', 'EVIDENCE_INTEGRITY', 'SECURITY_INTEGRITY');

-- CreateEnum
CREATE TYPE "CertificationOutcome" AS ENUM ('PASS', 'WARNING', 'FAIL', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ProofFindingSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ProofScenarioGroup" AS ENUM ('KNOWLEDGE', 'LEARNING', 'RUNTIME', 'EXCHANGE', 'CAPITAL', 'MEASUREMENT', 'GOVERNANCE', 'SECURITY', 'RECOVERY');

-- CreateEnum
CREATE TYPE "FailureInjectionType" AS ENUM ('MISSING_KNOWLEDGE', 'CORRUPTED_MEMORY', 'INVALID_EXCHANGE', 'AUTHORITY_VIOLATION', 'TRUST_FAILURE', 'EVIDENCE_LOSS', 'RUNTIME_INTERRUPTION', 'RECOVERY_FAILURE', 'STATE_CORRUPTION', 'MEASUREMENT_INCONSISTENCY');

-- CreateEnum
CREATE TYPE "FailureInjectionStatus" AS ENUM ('INJECTED', 'DETECTED', 'CONTAINED', 'RECOVERED', 'UNRECOVERED');

-- CreateEnum
CREATE TYPE "ContradictionType" AS ENUM ('KNOWLEDGE', 'INTENT', 'CAPITAL', 'MEASUREMENT', 'RUNTIME', 'GOVERNANCE');

-- CreateEnum
CREATE TYPE "ContradictionSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "StressCampaignState" AS ENUM ('OPEN', 'RUNNING', 'COMPLETED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StressExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'PASSED', 'DEGRADED', 'FAILED');

-- CreateEnum
CREATE TYPE "RecoveryStatus" AS ENUM ('PENDING', 'RECOVERED', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "proof_sessions" (
    "id" TEXT NOT NULL,
    "proof_session_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "state" "ProofSessionState" NOT NULL DEFAULT 'OPEN',
    "scope" TEXT,
    "target_domain" TEXT,
    "certification_outcome" "CertificationOutcome",
    "certification_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scenario_seq" INTEGER NOT NULL DEFAULT 0,
    "event_seq" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "proof_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proof_scenarios" (
    "id" TEXT NOT NULL,
    "scenario_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "group" "ProofScenarioGroup" NOT NULL,
    "gate" "CertificationGate",
    "version" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB,
    "expectation" JSONB,
    "repeatable" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "proof_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proof_executions" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "scenario_id" TEXT,
    "workspace_id" TEXT NOT NULL,
    "gate" "CertificationGate",
    "status" "ProofExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "outcome" "CertificationOutcome",
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "detail" TEXT,
    "actor_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proof_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proof_results" (
    "id" TEXT NOT NULL,
    "result_id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "gate" "CertificationGate" NOT NULL,
    "outcome" "CertificationOutcome" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expected" TEXT,
    "actual" TEXT,
    "detail" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proof_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proof_evidence" (
    "id" TEXT NOT NULL,
    "evidence_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "execution_id" TEXT,
    "workspace_id" TEXT NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "summary" TEXT,
    "payload" JSONB,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proof_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proof_findings" (
    "id" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "execution_id" TEXT,
    "workspace_id" TEXT NOT NULL,
    "severity" "ProofFindingSeverity" NOT NULL DEFAULT 'INFO',
    "gate" "CertificationGate",
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "recommendation" TEXT,
    "constitutional_refs" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proof_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proof_certifications" (
    "id" TEXT NOT NULL,
    "certification_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "gate" "CertificationGate" NOT NULL,
    "outcome" "CertificationOutcome" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "summary" TEXT,
    "evidence_ref" TEXT,
    "valid_until" TIMESTAMP(3),
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proof_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proof_history" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "execution_id" TEXT,
    "workspace_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "notes" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proof_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stress_campaigns" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "state" "StressCampaignState" NOT NULL DEFAULT 'OPEN',
    "group" "ProofScenarioGroup",
    "target_domain" TEXT,
    "scenario_seq" INTEGER NOT NULL DEFAULT 0,
    "event_seq" INTEGER NOT NULL DEFAULT 0,
    "resilience_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stress_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stress_scenarios" (
    "id" TEXT NOT NULL,
    "scenario_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "group" "ProofScenarioGroup" NOT NULL,
    "injection_type" "FailureInjectionType",
    "version" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB,
    "repeatable" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stress_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stress_executions" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "scenario_id" TEXT,
    "workspace_id" TEXT NOT NULL,
    "status" "StressExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "outcome" "CertificationOutcome",
    "resilience_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "injections_count" INTEGER NOT NULL DEFAULT 0,
    "recovered_count" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "detail" TEXT,
    "actor_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stress_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failure_injections" (
    "id" TEXT NOT NULL,
    "injection_id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "injection_type" "FailureInjectionType" NOT NULL,
    "status" "FailureInjectionStatus" NOT NULL DEFAULT 'INJECTED',
    "target_reference_id" TEXT,
    "target_reference_type" TEXT,
    "detected" BOOLEAN NOT NULL DEFAULT false,
    "contained" BOOLEAN NOT NULL DEFAULT false,
    "recovered" BOOLEAN NOT NULL DEFAULT false,
    "detail" TEXT,
    "actor_id" TEXT NOT NULL,
    "injected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failure_injections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stress_results" (
    "id" TEXT NOT NULL,
    "result_id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "outcome" "CertificationOutcome" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "detail" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stress_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stress_evidence" (
    "id" TEXT NOT NULL,
    "evidence_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "execution_id" TEXT,
    "workspace_id" TEXT NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "summary" TEXT,
    "payload" JSONB,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stress_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_evidence" (
    "id" TEXT NOT NULL,
    "recovery_id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "injection_id" TEXT,
    "campaign_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "status" "RecoveryStatus" NOT NULL DEFAULT 'PENDING',
    "strategy" TEXT,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "detail" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stress_history" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "execution_id" TEXT,
    "workspace_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "notes" TEXT,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stress_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contradictions" (
    "id" TEXT NOT NULL,
    "contradiction_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "session_id" TEXT,
    "execution_id" TEXT,
    "type" "ContradictionType" NOT NULL,
    "severity" "ContradictionSeverity" NOT NULL DEFAULT 'LOW',
    "impact" TEXT,
    "recommended_action" TEXT,
    "constitutional_refs" JSONB,
    "left_reference_id" TEXT,
    "left_reference_type" TEXT,
    "right_reference_id" TEXT,
    "right_reference_type" TEXT,
    "detail" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contradictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proof_sessions_proof_session_id_key" ON "proof_sessions"("proof_session_id");

-- CreateIndex
CREATE INDEX "proof_sessions_workspace_id_deleted_at_state_idx" ON "proof_sessions"("workspace_id", "deleted_at", "state");

-- CreateIndex
CREATE INDEX "proof_sessions_workspace_id_created_at_idx" ON "proof_sessions"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "proof_sessions_proof_session_id_idx" ON "proof_sessions"("proof_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "proof_scenarios_scenario_id_key" ON "proof_scenarios"("scenario_id");

-- CreateIndex
CREATE INDEX "proof_scenarios_session_id_deleted_at_group_idx" ON "proof_scenarios"("session_id", "deleted_at", "group");

-- CreateIndex
CREATE INDEX "proof_scenarios_workspace_id_created_at_idx" ON "proof_scenarios"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "proof_scenarios_scenario_id_idx" ON "proof_scenarios"("scenario_id");

-- CreateIndex
CREATE UNIQUE INDEX "proof_executions_execution_id_key" ON "proof_executions"("execution_id");

-- CreateIndex
CREATE INDEX "proof_executions_session_id_created_at_idx" ON "proof_executions"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "proof_executions_workspace_id_status_idx" ON "proof_executions"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "proof_executions_execution_id_idx" ON "proof_executions"("execution_id");

-- CreateIndex
CREATE UNIQUE INDEX "proof_results_result_id_key" ON "proof_results"("result_id");

-- CreateIndex
CREATE INDEX "proof_results_execution_id_idx" ON "proof_results"("execution_id");

-- CreateIndex
CREATE INDEX "proof_results_workspace_id_gate_idx" ON "proof_results"("workspace_id", "gate");

-- CreateIndex
CREATE UNIQUE INDEX "proof_evidence_evidence_id_key" ON "proof_evidence"("evidence_id");

-- CreateIndex
CREATE INDEX "proof_evidence_session_id_created_at_idx" ON "proof_evidence"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "proof_evidence_workspace_id_evidence_type_idx" ON "proof_evidence"("workspace_id", "evidence_type");

-- CreateIndex
CREATE UNIQUE INDEX "proof_findings_finding_id_key" ON "proof_findings"("finding_id");

-- CreateIndex
CREATE INDEX "proof_findings_session_id_created_at_idx" ON "proof_findings"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "proof_findings_workspace_id_severity_idx" ON "proof_findings"("workspace_id", "severity");

-- CreateIndex
CREATE INDEX "proof_findings_finding_id_idx" ON "proof_findings"("finding_id");

-- CreateIndex
CREATE UNIQUE INDEX "proof_certifications_certification_id_key" ON "proof_certifications"("certification_id");

-- CreateIndex
CREATE INDEX "proof_certifications_session_id_created_at_idx" ON "proof_certifications"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "proof_certifications_workspace_id_gate_idx" ON "proof_certifications"("workspace_id", "gate");

-- CreateIndex
CREATE INDEX "proof_certifications_certification_id_idx" ON "proof_certifications"("certification_id");

-- CreateIndex
CREATE INDEX "proof_history_session_id_created_at_idx" ON "proof_history"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "proof_history_workspace_id_event_type_idx" ON "proof_history"("workspace_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "stress_campaigns_campaign_id_key" ON "stress_campaigns"("campaign_id");

-- CreateIndex
CREATE INDEX "stress_campaigns_workspace_id_deleted_at_state_idx" ON "stress_campaigns"("workspace_id", "deleted_at", "state");

-- CreateIndex
CREATE INDEX "stress_campaigns_workspace_id_created_at_idx" ON "stress_campaigns"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "stress_campaigns_campaign_id_idx" ON "stress_campaigns"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "stress_scenarios_scenario_id_key" ON "stress_scenarios"("scenario_id");

-- CreateIndex
CREATE INDEX "stress_scenarios_campaign_id_deleted_at_group_idx" ON "stress_scenarios"("campaign_id", "deleted_at", "group");

-- CreateIndex
CREATE INDEX "stress_scenarios_workspace_id_created_at_idx" ON "stress_scenarios"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "stress_scenarios_scenario_id_idx" ON "stress_scenarios"("scenario_id");

-- CreateIndex
CREATE UNIQUE INDEX "stress_executions_execution_id_key" ON "stress_executions"("execution_id");

-- CreateIndex
CREATE INDEX "stress_executions_campaign_id_created_at_idx" ON "stress_executions"("campaign_id", "created_at");

-- CreateIndex
CREATE INDEX "stress_executions_workspace_id_status_idx" ON "stress_executions"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "stress_executions_execution_id_idx" ON "stress_executions"("execution_id");

-- CreateIndex
CREATE UNIQUE INDEX "failure_injections_injection_id_key" ON "failure_injections"("injection_id");

-- CreateIndex
CREATE INDEX "failure_injections_execution_id_idx" ON "failure_injections"("execution_id");

-- CreateIndex
CREATE INDEX "failure_injections_workspace_id_injection_type_idx" ON "failure_injections"("workspace_id", "injection_type");

-- CreateIndex
CREATE INDEX "failure_injections_injection_id_idx" ON "failure_injections"("injection_id");

-- CreateIndex
CREATE UNIQUE INDEX "stress_results_result_id_key" ON "stress_results"("result_id");

-- CreateIndex
CREATE INDEX "stress_results_execution_id_idx" ON "stress_results"("execution_id");

-- CreateIndex
CREATE INDEX "stress_results_workspace_id_dimension_idx" ON "stress_results"("workspace_id", "dimension");

-- CreateIndex
CREATE UNIQUE INDEX "stress_evidence_evidence_id_key" ON "stress_evidence"("evidence_id");

-- CreateIndex
CREATE INDEX "stress_evidence_campaign_id_created_at_idx" ON "stress_evidence"("campaign_id", "created_at");

-- CreateIndex
CREATE INDEX "stress_evidence_workspace_id_evidence_type_idx" ON "stress_evidence"("workspace_id", "evidence_type");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_evidence_recovery_id_key" ON "recovery_evidence"("recovery_id");

-- CreateIndex
CREATE INDEX "recovery_evidence_execution_id_idx" ON "recovery_evidence"("execution_id");

-- CreateIndex
CREATE INDEX "recovery_evidence_workspace_id_status_idx" ON "recovery_evidence"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "recovery_evidence_recovery_id_idx" ON "recovery_evidence"("recovery_id");

-- CreateIndex
CREATE INDEX "stress_history_campaign_id_created_at_idx" ON "stress_history"("campaign_id", "created_at");

-- CreateIndex
CREATE INDEX "stress_history_workspace_id_event_type_idx" ON "stress_history"("workspace_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "contradictions_contradiction_id_key" ON "contradictions"("contradiction_id");

-- CreateIndex
CREATE INDEX "contradictions_workspace_id_created_at_idx" ON "contradictions"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "contradictions_workspace_id_type_idx" ON "contradictions"("workspace_id", "type");

-- CreateIndex
CREATE INDEX "contradictions_contradiction_id_idx" ON "contradictions"("contradiction_id");

-- AddForeignKey
ALTER TABLE "proof_sessions" ADD CONSTRAINT "proof_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_scenarios" ADD CONSTRAINT "proof_scenarios_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "proof_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_scenarios" ADD CONSTRAINT "proof_scenarios_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_executions" ADD CONSTRAINT "proof_executions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "proof_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_executions" ADD CONSTRAINT "proof_executions_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "proof_scenarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_executions" ADD CONSTRAINT "proof_executions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_results" ADD CONSTRAINT "proof_results_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "proof_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_results" ADD CONSTRAINT "proof_results_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "proof_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_results" ADD CONSTRAINT "proof_results_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_evidence" ADD CONSTRAINT "proof_evidence_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "proof_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_evidence" ADD CONSTRAINT "proof_evidence_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "proof_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_evidence" ADD CONSTRAINT "proof_evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_findings" ADD CONSTRAINT "proof_findings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "proof_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_findings" ADD CONSTRAINT "proof_findings_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "proof_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_findings" ADD CONSTRAINT "proof_findings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_certifications" ADD CONSTRAINT "proof_certifications_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "proof_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_certifications" ADD CONSTRAINT "proof_certifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_history" ADD CONSTRAINT "proof_history_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "proof_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_history" ADD CONSTRAINT "proof_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stress_campaigns" ADD CONSTRAINT "stress_campaigns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stress_scenarios" ADD CONSTRAINT "stress_scenarios_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "stress_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stress_scenarios" ADD CONSTRAINT "stress_scenarios_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stress_executions" ADD CONSTRAINT "stress_executions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "stress_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stress_executions" ADD CONSTRAINT "stress_executions_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "stress_scenarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stress_executions" ADD CONSTRAINT "stress_executions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_injections" ADD CONSTRAINT "failure_injections_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "stress_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_injections" ADD CONSTRAINT "failure_injections_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "stress_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failure_injections" ADD CONSTRAINT "failure_injections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stress_results" ADD CONSTRAINT "stress_results_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "stress_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stress_results" ADD CONSTRAINT "stress_results_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "stress_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stress_results" ADD CONSTRAINT "stress_results_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stress_evidence" ADD CONSTRAINT "stress_evidence_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "stress_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stress_evidence" ADD CONSTRAINT "stress_evidence_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "stress_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stress_evidence" ADD CONSTRAINT "stress_evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_evidence" ADD CONSTRAINT "recovery_evidence_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "stress_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_evidence" ADD CONSTRAINT "recovery_evidence_injection_id_fkey" FOREIGN KEY ("injection_id") REFERENCES "failure_injections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_evidence" ADD CONSTRAINT "recovery_evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stress_history" ADD CONSTRAINT "stress_history_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "stress_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stress_history" ADD CONSTRAINT "stress_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contradictions" ADD CONSTRAINT "contradictions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
