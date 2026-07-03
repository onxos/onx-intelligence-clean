import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import {
  AddClinicalLifecycleEventDto,
  ClinicalPatientListQueryDto,
  CreateClinicalPatientDto,
  UpdateClinicalPatientStatusDto,
} from './patient-lifecycle.dto';
import { PatientLifecycleService } from './patient-lifecycle.service';

@ApiTags('Clinical')
@Controller('clinical/patients')
@UseGuards(JwtAuthGuard)
export class PatientLifecycleController {
  constructor(private readonly service: PatientLifecycleService) {}

  @Get()
  list(@Query() query: ClinicalPatientListQueryDto & { workspaceId: string }) {
    return this.service.listPatients(query.workspaceId, query);
  }

  @Get('summary')
  summary(@Query('workspaceId') workspaceId: string) {
    return this.service.summary(workspaceId);
  }

  @Get(':patientId')
  get(@Param('patientId') patientId: string, @Query('workspaceId') workspaceId: string) {
    return this.service.getPatient(workspaceId, patientId);
  }

  @Get(':patientId/events')
  events(@Param('patientId') patientId: string, @Query('workspaceId') workspaceId: string) {
    return this.service.listEvents(workspaceId, patientId);
  }

  @Post()
  create(@Body() dto: CreateClinicalPatientDto, @Req() req: { user: { userId: string } }) {
    return this.service.createPatient(req.user.userId, dto);
  }

  @Patch(':patientId/status')
  updateStatus(
    @Param('patientId') patientId: string,
    @Query('workspaceId') workspaceId: string,
    @Body() dto: UpdateClinicalPatientStatusDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.service.updateStatus(workspaceId, req.user.userId, patientId, dto);
  }

  @Post(':patientId/events')
  addEvent(
    @Param('patientId') patientId: string,
    @Query('workspaceId') workspaceId: string,
    @Body() dto: AddClinicalLifecycleEventDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.service.addEvent(workspaceId, req.user.userId, patientId, dto);
  }
}