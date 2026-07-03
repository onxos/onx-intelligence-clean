import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { AddToWaitlistDto, BuildScheduleDto, CreateAppointmentDto } from './appointment-intelligence.dto';
import { AppointmentIntelligenceService } from './appointment-intelligence.service';

@Controller('clinical/appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentIntelligenceController {
  constructor(private readonly service: AppointmentIntelligenceService) {}

  @Get()
  list(@Req() req: { user: { workspaceId: string } }) {
    return this.service.buildSchedule(req.user.workspaceId, {});
  }

  @Post()
  createAppointment(@Body() dto: CreateAppointmentDto, @Req() req: { user: { workspaceId: string } }) {
    const reason = [dto.type, dto.reason, dto.notes].filter(Boolean).join(' | ');
    return this.service.addToWaitlist(req.user.workspaceId, {
      patientId: dto.patientId,
      reason: `${dto.date} | ${reason}`,
      priority: 1,
    });
  }

  @Post('waitlist')
  addToWaitlist(@Body() dto: AddToWaitlistDto, @Req() req: { user: { workspaceId: string } }) {
    return this.service.addToWaitlist(req.user.workspaceId, dto);
  }

  @Get('waitlist')
  listWaitlist(@Req() req: { user: { workspaceId: string } }) {
    return this.service.listWaitlist(req.user.workspaceId);
  }

  @Post('schedule')
  buildSchedule(@Body() dto: BuildScheduleDto, @Req() req: { user: { workspaceId: string } }) {
    return this.service.buildSchedule(req.user.workspaceId, dto);
  }
}