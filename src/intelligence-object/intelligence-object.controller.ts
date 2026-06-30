import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';
import { IntelligenceObjectService } from './intelligence-object.service';
import {
  CreateIntelligenceObjectDto,
  CreateProvenanceDto,
  CreateRelationshipDto,
  IntelligenceObjectListQueryDto,
  LifecycleTransitionDto,
  UpdateIntelligenceObjectDto,
} from './dto/intelligence-object.dto';

@ApiTags('Intelligence Objects')
@Controller('intelligence-objects')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IntelligenceObjectController {
  constructor(private readonly svc: IntelligenceObjectService) {}

  @Post()
  @ApiOperation({ summary: 'Create intelligence object' })
  @ApiBody({ type: CreateIntelligenceObjectDto })
  async create(@Req() req: any, @Body() body: CreateIntelligenceObjectDto) {
    return this.svc.create(req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get()
  @ApiOperation({ summary: 'List intelligence objects' })
  async list(@Req() req: any, @Query() query: IntelligenceObjectListQueryDto) {
    return this.svc.findAll(req.user.workspaceId, req.user.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single intelligence object' })
  async get(@Req() req: any, @Param('id') id: string) {
    return this.svc.findOne(id, req.user.workspaceId, req.user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update intelligence object' })
  @ApiBody({ type: UpdateIntelligenceObjectDto })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateIntelligenceObjectDto,
  ) {
    return this.svc.update(id, req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete intelligence object' })
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.svc.remove(id, req.user.workspaceId, req.user.userId, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore soft-deleted intelligence object' })
  async restore(@Req() req: any, @Param('id') id: string) {
    return this.svc.restore(id, req.user.workspaceId, req.user.userId, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Post(':id/lifecycle')
  @ApiOperation({ summary: 'Transition intelligence object lifecycle state' })
  @ApiBody({ type: LifecycleTransitionDto })
  async transition(@Req() req: any, @Param('id') id: string, @Body() body: LifecycleTransitionDto) {
    return this.svc.transitionLifecycle(id, req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get(':id/lifecycle')
  @ApiOperation({ summary: 'List lifecycle events for an intelligence object' })
  async lifecycleEvents(@Req() req: any, @Param('id') id: string) {
    return this.svc.listLifecycleEvents(id, req.user.workspaceId, req.user.userId);
  }

  @Post(':id/relationships')
  @ApiOperation({ summary: 'Create relationship from an intelligence object' })
  @ApiBody({ type: CreateRelationshipDto })
  async createRelationship(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: CreateRelationshipDto,
  ) {
    return this.svc.createRelationship(id, req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get(':id/relationships')
  @ApiOperation({ summary: 'List relationships for an intelligence object' })
  async listRelationships(@Req() req: any, @Param('id') id: string) {
    return this.svc.listRelationships(id, req.user.workspaceId, req.user.userId);
  }

  @Post(':id/provenance')
  @ApiOperation({ summary: 'Record a provenance dimension for an intelligence object' })
  @ApiBody({ type: CreateProvenanceDto })
  async addProvenance(@Req() req: any, @Param('id') id: string, @Body() body: CreateProvenanceDto) {
    return this.svc.addProvenance(id, req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get(':id/provenance')
  @ApiOperation({ summary: 'Retrieve provenance for an intelligence object' })
  async provenance(@Req() req: any, @Param('id') id: string) {
    return this.svc.retrieveProvenance(id, req.user.workspaceId, req.user.userId);
  }

  @Get(':id/lineage')
  @ApiOperation({ summary: 'Retrieve derivation lineage for an intelligence object' })
  async lineage(@Req() req: any, @Param('id') id: string) {
    return this.svc.retrieveLineage(id, req.user.workspaceId, req.user.userId);
  }

  @Get(':id/validate')
  @ApiOperation({ summary: 'Validate an intelligence object against D16 rules' })
  async validate(@Req() req: any, @Param('id') id: string) {
    return this.svc.validate(id, req.user.workspaceId, req.user.userId);
  }
}
