import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';
import { CrossDomainQueriesService } from './cross-domain-queries.service';

@ApiTags('Atlas V7 — Cross-Domain Queries')
@Controller('cross-domain-queries')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CrossDomainQueriesController {
  constructor(private readonly svc: CrossDomainQueriesService) {}

  @Get('patient-appointment-invoice/:patientId')
  @RequirePermissions(Permission.ATLAS_CROSS_DOMAIN_READ)
  @ApiOperation({ summary: 'Patient -> Appointment -> Invoice (Clinical-Financial)' })
  patientAppointmentInvoice(
    @Param('patientId') patientId: string,
    @Query('workspaceId') workspaceId: string,
  ) {
    return this.svc.patientAppointmentInvoice(workspaceId, patientId);
  }

  @Get('patient-lab-prescription-inventory/:patientId')
  @RequirePermissions(Permission.ATLAS_CROSS_DOMAIN_READ)
  @ApiOperation({
    summary: 'Patient -> LabResult -> Prescription -> Inventory (Clinical-Operational)',
  })
  patientLabPrescriptionInventory(
    @Param('patientId') patientId: string,
    @Query('workspaceId') workspaceId: string,
  ) {
    return this.svc.patientLabPrescriptionInventory(workspaceId, patientId);
  }

  @Get('appointment-record-document/:appointmentId')
  @RequirePermissions(Permission.ATLAS_CROSS_DOMAIN_READ)
  @ApiOperation({
    summary: 'Appointment -> MedicalRecord -> ClinicalDocument (Clinical-Documentation)',
  })
  appointmentRecordDocument(
    @Param('appointmentId') appointmentId: string,
    @Query('workspaceId') workspaceId: string,
  ) {
    return this.svc.appointmentRecordDocument(workspaceId, appointmentId);
  }

  @Get('vaccination-due-followup')
  @RequirePermissions(Permission.ATLAS_CROSS_DOMAIN_READ)
  @ApiOperation({ summary: 'Vaccination Due -> Upcoming Appointment (Preventive-Operational)' })
  vaccinationDueFollowup(@Query('workspaceId') workspaceId: string) {
    return this.svc.vaccinationDueFollowup(workspaceId);
  }
}
