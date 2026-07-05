/**
 * Atlas V7 — Deep Cross-Domain Queries
 * Four JOIN chains spanning clinical, financial, operational, documentation
 * and preventive-care domains. Aggregations are computed via correlated
 * subqueries to avoid row fan-out from multiple LEFT JOINs.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class CrossDomainQueriesService {
  constructor(private readonly prisma: PrismaService) {}

  // Chain 1: Patient -> Appointment -> Invoice (Clinical-Financial)
  async patientAppointmentInvoice(workspaceId: string, patientId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        p.name as patient_name, p.species,
        COALESCE(appt.total_appointments, 0) as total_appointments,
        COALESCE(inv.total_invoiced, 0) as total_invoiced,
        COALESCE(inv.total_paid, 0) as total_paid,
        COALESCE(inv.outstanding_balance, 0) as outstanding_balance
      FROM patients p
      LEFT JOIN (
        SELECT patient_id, COUNT(*) as total_appointments
        FROM appointments WHERE workspace_id = ${workspaceId}
        GROUP BY patient_id
      ) appt ON appt.patient_id = p.id
      LEFT JOIN (
        SELECT patient_id, SUM(total) as total_invoiced, SUM(paid_amount) as total_paid, SUM(balance) as outstanding_balance
        FROM invoices WHERE workspace_id = ${workspaceId}
        GROUP BY patient_id
      ) inv ON inv.patient_id = p.id
      WHERE p.id = ${patientId} AND p.workspace_id = ${workspaceId}
    `;
    return rows[0] ?? null;
  }

  // Chain 2: Patient -> LabResult -> Prescription -> Inventory (Clinical-Operational)
  async patientLabPrescriptionInventory(workspaceId: string, patientId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        p.name as patient_name,
        COALESCE(lab.lab_tests_count, 0) as lab_tests_count,
        COALESCE(rx.prescriptions_count, 0) as prescriptions_count,
        rx.medications_used,
        prod.products_in_stock
      FROM patients p
      LEFT JOIN (
        SELECT patient_id, COUNT(*) as lab_tests_count
        FROM lab_results WHERE workspace_id = ${workspaceId}
        GROUP BY patient_id
      ) lab ON lab.patient_id = p.id
      LEFT JOIN (
        SELECT patient_id, COUNT(*) as prescriptions_count, STRING_AGG(DISTINCT medication, ', ') as medications_used
        FROM prescriptions WHERE workspace_id = ${workspaceId}
        GROUP BY patient_id
      ) rx ON rx.patient_id = p.id
      LEFT JOIN (
        SELECT rx2.patient_id, STRING_AGG(DISTINCT pr.name, ', ') as products_in_stock
        FROM prescriptions rx2
        JOIN products pr ON pr.name = rx2.medication AND pr.workspace_id = ${workspaceId}
        WHERE rx2.workspace_id = ${workspaceId}
        GROUP BY rx2.patient_id
      ) prod ON prod.patient_id = p.id
      WHERE p.id = ${patientId} AND p.workspace_id = ${workspaceId}
    `;
    return rows[0] ?? null;
  }

  // Chain 3: Appointment -> MedicalRecord -> ClinicalDocument (Clinical-Documentation)
  async appointmentRecordDocument(workspaceId: string, appointmentId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        a.title as appointment_title, a.date, a.status, a.type,
        mr.chief_complaint, mr.diagnosis, mr.treatment_plan,
        COALESCE(doc.attached_documents, 0) as attached_documents
      FROM appointments a
      LEFT JOIN medical_records mr ON mr.appointment_id = a.id
      LEFT JOIN (
        SELECT medical_record_id, COUNT(*) as attached_documents
        FROM clinical_documents WHERE workspace_id = ${workspaceId}
        GROUP BY medical_record_id
      ) doc ON doc.medical_record_id = mr.id
      WHERE a.id = ${appointmentId} AND a.workspace_id = ${workspaceId}
    `;
    return rows[0] ?? null;
  }

  // Chain 4: Vaccination Due -> Upcoming Appointment (Preventive-Operational)
  async vaccinationDueFollowup(workspaceId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        p.name as patient_name, p.owner_name, p.owner_phone,
        vr.vaccine_name, vr.next_due_date,
        CASE WHEN vr.next_due_date < NOW() THEN 'OVERDUE' ELSE 'UPCOMING' END as status,
        followup.scheduled_followup
      FROM patients p
      INNER JOIN vaccination_records vr ON vr.patient_id = p.id AND vr.workspace_id = ${workspaceId}
      LEFT JOIN LATERAL (
        SELECT a.title as scheduled_followup
        FROM appointments a
        WHERE a.patient_id = p.id AND a.workspace_id = ${workspaceId} AND a.type = 'VACCINATION' AND a.date > NOW()
        ORDER BY a.date ASC
        LIMIT 1
      ) followup ON true
      WHERE vr.next_due_date < NOW() + INTERVAL '30 days'
      AND p.workspace_id = ${workspaceId}
      ORDER BY vr.next_due_date ASC
      LIMIT 50
    `;
    return rows;
  }
}
