import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { AddToWaitlistDto, BuildScheduleDto } from './appointment-intelligence.dto';
import { AppointmentIntelligenceService } from './appointment-intelligence.service';

@Controller('clinical/appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentIntelligenceController {
  constructor(private readonly service: AppointmentIntelligenceService) {}

  @Post('waitlist')
  addToWaitlist(@Body() dto: AddToWaitlistDto) {
    return this.service.addToWaitlist(dto);
  }

  @Get('waitlist')
  listWaitlist(@Query('workspaceId') workspaceId: string) {
    return this.service.listWaitlist(workspaceId);
  }

  @Post('schedule')
  buildSchedule(@Body() dto: BuildScheduleDto) {
    return this.service.buildSchedule(dto);
  }
}