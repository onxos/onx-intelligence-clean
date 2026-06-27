import {
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { EvidenceService } from './evidence.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { getRequestAuditContext } from '../common/audit-context.util';

class CreateEvidenceDto {
  @ApiProperty({ example: 'Assess model output quality' })
  @IsString()
  intent: string;

  @ApiProperty({ required: false, example: 0.82 })
  @IsOptional()
  @IsNumber()
  confidence?: number;
}

class UpdateEvidenceDto {
  @ApiProperty({ required: false, example: 'Updated intent' })
  @IsOptional()
  @IsString()
  intent?: string;

  @ApiProperty({ required: false, example: 0.91 })
  @IsOptional()
  @IsNumber()
  confidence?: number;

  @ApiProperty({ required: false, example: 'Approved by reviewer' })
  @IsOptional()
  @IsString()
  judgment?: string;

  @ApiProperty({ required: false, example: 'SUCCESS' })
  @IsOptional()
  @IsString()
  outcome?: string;

  @ApiProperty({ required: false, example: 'Use stronger grounding sources next run' })
  @IsOptional()
  @IsString()
  learning?: string;
}

@ApiTags('Evidence')
@Controller('evidence')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EvidenceController {
  constructor(private readonly svc: EvidenceService) {}

  @Get()
  @ApiOperation({ summary: 'List evidence records' })
  async list(@Req() req: any, @Query() query: any) {
    return this.svc.findAll(req.user.workspaceId, req.user.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get evidence record details' })
  async get(@Param('id') id: string, @Req() req: any) {
    return this.svc.findOne(id, req.user.workspaceId, req.user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create evidence record' })
  async create(@Body() body: CreateEvidenceDto, @Req() req: any) {
    return this.svc.create(
      {
        intent: body.intent,
        confidence: body.confidence,
        ownerId: req.user.userId,
        workspaceId: req.user.workspaceId,
      },
      getRequestAuditContext(req),
    );
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update evidence record' })
  async update(@Param('id') id: string, @Body() body: UpdateEvidenceDto, @Req() req: any) {
    return this.svc.update(
      id,
      req.user.workspaceId,
      req.user.userId,
      body,
      getRequestAuditContext(req),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete evidence record' })
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.svc.remove(id, req.user.workspaceId, req.user.userId, getRequestAuditContext(req));
  }
}
