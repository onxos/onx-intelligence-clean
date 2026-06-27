import {
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Body,
  Query,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IntelligenceObjectType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { IntelligenceService } from './intelligence.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

class CreateIntelligenceDto {
  @ApiProperty({ example: 'Weekly Risk Summary' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Detailed intelligence content here' })
  @IsString()
  content: string;

  @ApiProperty({ example: 'JUDGMENT' })
  @IsEnum(IntelligenceObjectType)
  objectType: IntelligenceObjectType;

  @ApiProperty({ required: false, example: 'Business summary for operators' })
  @IsOptional()
  @IsString()
  semanticSummary?: string;

  @ApiProperty({ required: false, example: 'L1_FOUNDATIONAL' })
  @IsOptional()
  @IsString()
  layer?: string;

  @ApiProperty({ required: false, example: 'L2_SIL' })
  @IsOptional()
  @IsString()
  originSource?: string;

  @ApiProperty({ required: false, example: 'institutional' })
  @IsOptional()
  @IsString()
  ownershipClass?: string;

  @ApiProperty({ required: false, example: 0.73 })
  @IsOptional()
  @IsNumber()
  amanahScore?: number;

  @ApiProperty({ required: false, example: 'INSTITUTIONAL' })
  @IsOptional()
  @IsString()
  privacyLevel?: string;

  @ApiProperty({ required: false, example: 'KNOWLEDGE' })
  @IsOptional()
  @IsString()
  capitalCategory?: string;
}

class UpdateIntelligenceDto {
  @ApiProperty({ required: false, example: 'Updated object name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, example: 'Updated object content' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ required: false, example: 'PATTERN' })
  @IsOptional()
  @IsEnum(IntelligenceObjectType)
  objectType?: IntelligenceObjectType;

  @ApiProperty({ required: false, example: 'Updated semantic summary' })
  @IsOptional()
  @IsString()
  semanticSummary?: string;

  @ApiProperty({ required: false, example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({ required: false, example: 'INSTITUTIONAL' })
  @IsOptional()
  @IsString()
  privacyLevel?: string;

  @ApiProperty({ required: false, example: 0.88 })
  @IsOptional()
  @IsNumber()
  confidenceScore?: number;

  @ApiProperty({ required: false, example: 0.9 })
  @IsOptional()
  @IsNumber()
  trustScore?: number;

  @ApiProperty({ required: false, example: 0.86 })
  @IsOptional()
  @IsNumber()
  qualityIndex?: number;
}

@ApiTags('Intelligence')
@Controller('intelligence')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IntelligenceController {
  constructor(private readonly svc: IntelligenceService) {}

  @Post()
  @ApiOperation({ summary: 'Create intelligence object' })
  async create(@Body() body: CreateIntelligenceDto, @Req() req: any) {
    return this.svc.create({
      ...body,
      ownerId: req.user.userId,
      creatorId: req.user.userId,
      workspaceId: req.user.workspaceId,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List intelligence objects' })
  async list(@Query() query: any, @Req() req: any) {
    return this.svc.findAll(req.user.workspaceId, req.user.userId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get intelligence statistics' })
  async stats(@Req() req: any) {
    return this.svc.stats(req.user.workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single intelligence object' })
  async get(@Param('id') id: string, @Req() req: any) {
    return this.svc.findOne(id, req.user.workspaceId, req.user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update intelligence object' })
  async update(@Param('id') id: string, @Body() body: UpdateIntelligenceDto, @Req() req: any) {
    return this.svc.update(id, req.user.workspaceId, req.user.userId, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete intelligence object' })
  async remove(@Param('id') id: string, @Req() req: any) {
    return this.svc.remove(id, req.user.workspaceId, req.user.userId);
  }
}
