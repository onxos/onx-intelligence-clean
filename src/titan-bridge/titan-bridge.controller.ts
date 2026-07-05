import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';
import { TitanBridgeService, TitanName } from './titan-bridge.service';

const TITANS: TitanName[] = ['prometheus', 'athena', 'zeus', 'hermes', 'apollo'];

@ApiTags('Atlas V7 — Titan Bridge')
@Controller('titan-bridge')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TitanBridgeController {
  constructor(private readonly svc: TitanBridgeService) {}

  @Post('train/:titan')
  @RequirePermissions(Permission.ATLAS_TITAN_TRAIN)
  @ApiOperation({
    summary: 'Queue training for a Titan engine (prometheus|athena|zeus|hermes|apollo)',
  })
  train(
    @Param('titan') titan: string,
    @Query('workspaceId') workspaceId: string,
    @Body() body: Record<string, any> = {},
  ) {
    return this.svc.train(this.assertTitan(titan), workspaceId, body);
  }

  @Get('infer/:titan')
  @RequirePermissions(Permission.ATLAS_TITAN_INFER)
  @ApiOperation({
    summary: 'Request inference from a Titan engine (prometheus|athena|zeus|hermes|apollo)',
  })
  infer(
    @Param('titan') titan: string,
    @Query('workspaceId') workspaceId: string,
    @Query() query: Record<string, any> = {},
  ) {
    return this.svc.infer(this.assertTitan(titan), workspaceId, query);
  }

  private assertTitan(titan: string): TitanName {
    const normalized = titan.toLowerCase() as TitanName;
    if (!TITANS.includes(normalized)) {
      throw new BadRequestException(
        `Unknown Titan "${titan}". Expected one of: ${TITANS.join(', ')}`,
      );
    }
    return normalized;
  }
}
