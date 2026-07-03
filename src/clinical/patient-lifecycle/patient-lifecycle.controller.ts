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
  list(@Req() req: { user: { workspaceId: string } }, @Query() query: ClinicalPatientListQueryDto) {
    return this.service.listPatients(req.user.workspaceId, query);
  }

  @Get('summary')
  summary(@Req() req: { user: { workspaceId: string } }) {
    return this.service.summary(req.user.workspaceId);
  }

  @Get(':patientId')
  get(@Param('patientId') patientId: string, @Req() req: { user: { workspaceId: string } }) {
    return this.service.getPatient(req.user.workspaceId, patientId);
  }

  @Get(':patientId/events')
  events(@Param('patientId') patientId: string, @Req() req: { user: { workspaceId: string } }) {
    return this.service.listEvents(req.user.workspaceId, patientId);
  }

  @Post()
  create(@Body() dto: CreateClinicalPatientDto, @Req() req: { user: { userId: string; workspaceId: string } }) {
    return this.service.createPatient(req.user.workspaceId, req.user.userId, dto);
  }

  @Patch(':patientId/status')
  updateStatus(
    @Param('patientId') patientId: string,
    @Body() dto: UpdateClinicalPatientStatusDto,
    @Req() req: { user: { userId: string; workspaceId: string } },
  ) {
    return this.service.updateStatus(req.user.workspaceId, req.user.userId, patientId, dto);
  }

  @Post(':patientId/events')
  addEvent(
    @Param('patientId') patientId: string,
    @Body() dto: AddClinicalLifecycleEventDto,
    @Req() req: { user: { userId: string; workspaceId: string } },
  ) {
    return this.service.addEvent(req.user.workspaceId, req.user.userId, patientId, dto);
  }
}