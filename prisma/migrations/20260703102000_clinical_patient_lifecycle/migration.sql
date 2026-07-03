-- Phase 1 Clinical Core: Patient Lifecycle
-- Adds a workspace-scoped clinical patient registry with immutable lifecycle
-- events for registration, status changes, and visit notes.

-- CreateTable
CREATE TABLE "clinical_patients" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "breed" TEXT NOT NULL,
    "age_years" INTEGER NOT NULL,
    "weight_kg" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'stable',
    "presenting_signs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB DEFAULT '{}'::jsonb,
    "workspace_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "clinical_patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_lifecycle_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "previous_status" TEXT,
    "next_status" TEXT,
    "note" TEXT,
    "metadata" JSONB DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinical_patients_patient_id_key" ON "clinical_patients"("patient_id");
CREATE INDEX "clinical_patients_workspace_id_deleted_at_status_idx" ON "clinical_patients"("workspace_id", "deleted_at", "status");
CREATE INDEX "clinical_patients_workspace_id_created_at_idx" ON "clinical_patients"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_lifecycle_events_event_id_key" ON "clinical_lifecycle_events"("event_id");
CREATE INDEX "clinical_lifecycle_events_patient_id_created_at_idx" ON "clinical_lifecycle_events"("patient_id", "created_at");
CREATE INDEX "clinical_lifecycle_events_workspace_id_created_at_idx" ON "clinical_lifecycle_events"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "clinical_patients" ADD CONSTRAINT "clinical_patients_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_patients" ADD CONSTRAINT "clinical_patients_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "clinical_lifecycle_events" ADD CONSTRAINT "clinical_lifecycle_events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical_patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_lifecycle_events" ADD CONSTRAINT "clinical_lifecycle_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical_lifecycle_events" ADD CONSTRAINT "clinical_lifecycle_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
