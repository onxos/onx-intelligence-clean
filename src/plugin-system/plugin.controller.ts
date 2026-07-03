import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PluginRegistryService } from './plugin-registry.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RbacGuard, RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';
import { PluginManifest } from './plugin.interface';

@Controller('plugins')
@UseGuards(JwtAuthGuard)
export class PluginController {
  constructor(private readonly r: PluginRegistryService) {}

  @Get()
  @RequirePermissions(Permission.WORKSPACE_READ)
  @UseGuards(RbacGuard)
  list(@Query('type') t?: string) {
    return this.r.list(t);
  }

  @Post('register')
  @RequirePermissions(Permission.WORKSPACE_SETTINGS)
  @UseGuards(RbacGuard)
  register(@Body() d: { manifest: PluginManifest }) {
    return this.r.register(d.manifest);
  }

  @Post(':id/activate')
  @RequirePermissions(Permission.WORKSPACE_SETTINGS)
  @UseGuards(RbacGuard)
  activate(@Param('id') id: string, @Body() d: { config: Record<string, unknown> }) {
    return this.r.activate(id, d.config);
  }

  @Post(':id/deactivate')
  @RequirePermissions(Permission.WORKSPACE_SETTINGS)
  @UseGuards(RbacGuard)
  deactivate(@Param('id') id: string) {
    return this.r.deactivate(id);
  }

  @Delete(':id')
  @RequirePermissions(Permission.WORKSPACE_SETTINGS)
  @UseGuards(RbacGuard)
  remove(@Param('id') id: string) {
    return this.r.unregister(id);
  }
}
