import { Body, Controller, Get, Post, Param, Query, UseGuards, Req } from '@nestjs/common';
import { DiagnosticService } from './diagnostic.service';
import { TreatmentService } from './treatment.service';
import { VoiceSoapService } from './voice-soap.service';
import { SmartSchedulingService } from './smart-scheduling.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuditService } from '../common/audit.service';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@Controller('intelligence-overlay')
@UseGuards(JwtAuthGuard)
export class IntelligenceOverlayController {
  constructor(
    private readonly diagnosticService: DiagnosticService,
    private readonly treatmentService: TreatmentService,
    private readonly voiceSoapService: VoiceSoapService,
    private readonly smartSchedulingService: SmartSchedulingService,
    private readonly auditService: AuditService,
  ) {}

  // --- Diagnostic Assistant ---
  @Post('diagnose')
  @RequirePermissions(Permission.AI_DIAGNOSTIC)
  async diagnose(@Body() body: { symptoms: string[]; species: string; breed?: string; age?: number; weight?: number; gender?: string; labResults?: any[] }, @Query('workspaceId') w: string, @Req() req: any) {
    const result = await this.diagnosticService.analyze(body, w);
    await this.auditService.log({ action: 'AI_DIAGNOSE', resource: 'IntelligenceOverlay', resourceId: result.id, actorId: req.user?.userId || 'system', workspaceId: w, newValue: result });
    return result;
  }

  @Get('diagnose/:patientId/history')
  @RequirePermissions(Permission.AI_DIAGNOSTIC)
  async diagnosisHistory(@Param('patientId') p: string, @Query('workspaceId') w: string) {
    return this.diagnosticService.getHistory(p, w);
  }

  // --- Treatment Recommender ---
  @Post('treat')
  @RequirePermissions(Permission.AI_DIAGNOSTIC)
  async recommendTreatment(@Body() body: { diagnosis: string; patientId: string; species: string; weight?: number; allergies?: string[]; currentMedications?: string[] }, @Query('workspaceId') w: string, @Req() req: any) {
    const result = await this.treatmentService.recommend(body, w);
    await this.auditService.log({ action: 'AI_TREATMENT', resource: 'IntelligenceOverlay', resourceId: result.id, actorId: req.user?.userId || 'system', workspaceId: w, newValue: result });
    return result;
  }

  @Get('treat/:diagnosis/protocols')
  @RequirePermissions(Permission.AI_DIAGNOSTIC)
  async protocols(@Param('diagnosis') d: string, @Query('species') s: string) {
    return this.treatmentService.getProtocols(d, s);
  }

  // --- Voice-to-SOAP ---
  @Post('voice-to-soap')
  @RequirePermissions(Permission.AI_DIAGNOSTIC)
  async voiceToSoap(@Body() body: { transcript: string; veterinarianId: string; patientId?: string; appointmentId?: string }, @Query('workspaceId') w: string, @Req() req: any) {
    const result = await this.voiceSoapService.convert(body.transcript, body.veterinarianId, w, body.patientId, body.appointmentId);
    await this.auditService.log({ action: 'AI_VOICE_TO_SOAP', resource: 'IntelligenceOverlay', resourceId: result.id, actorId: req.user?.userId || 'system', workspaceId: w, newValue: result });
    return result;
  }

  @Post('voice-to-soap/:recordId/confirm')
  @RequirePermissions(Permission.AI_DIAGNOSTIC)
  async confirmSoap(@Param('recordId') id: string, @Query('workspaceId') w: string, @Body('confirmed') confirmed: boolean, @Req() req: any) {
    const result = await this.voiceSoapService.confirm(id, w, confirmed, req.user?.userId);
    await this.auditService.log({ action: 'AI_SOAP_CONFIRM', resource: 'IntelligenceOverlay', resourceId: id, actorId: req.user?.userId || 'system', workspaceId: w, newValue: result });
    return result;
  }

  // --- Smart Scheduling ---
  @Get('smart-schedule/slots')
  @RequirePermissions(Permission.APPOINTMENT_READ)
  async suggestSlots(@Query('workspaceId') w: string, @Query('date') date: string, @Query('duration') duration: string, @Query('veterinarianId') vetId?: string) {
    return this.smartSchedulingService.suggestSlots(w, new Date(date), parseInt(duration || '30', 10), vetId);
  }

  @Get('smart-schedule/optimize')
  @RequirePermissions(Permission.ANALYTICS_READ)
  async optimizeSchedule(@Query('workspaceId') w: string, @Query('date') date: string) {
    return this.smartSchedulingService.optimizeDay(w, new Date(date));
  }

  @Post('smart-schedule/auto-book')
  @RequirePermissions(Permission.APPOINTMENT_CREATE)
  async autoBook(@Body() body: { patientId: string; preferredDates: string[]; duration: number; type: string; veterinarianId?: string; notes?: string }, @Query('workspaceId') w: string, @Req() req: any) {
    const result = await this.smartSchedulingService.autoBook(body, w, req.user?.userId);
    await this.auditService.log({ action: 'AI_AUTO_BOOK', resource: 'Appointment', resourceId: (result as any).appointmentId, actorId: req.user?.userId || 'system', workspaceId: w, newValue: result });
    return result;
  }
}
