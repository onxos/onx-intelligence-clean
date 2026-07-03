import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { AddToWaitlistDto, BuildScheduleDto } from './appointment-intelligence.dto';
import { AppointmentIntelligenceService } from './appointment-intelligence.service';

@Controller('clinical/appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentIntelligenceController {
  constructor(private readonly service: AppointmentIntelligenceService) {}

  @Get()
  list(@Req() req: { user: { workspaceId: string } }) {
    return this.service.buildSchedule(req.user.workspaceId, {});
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