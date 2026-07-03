/**
 * ONX Plugin System — Controller
 * API endpoints for plugin management
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PluginRegistryService } from './plugin-registry.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard, RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';
import { PluginManifest } from './plugin.interface';

class ActivatePluginDto {
  config: Record<string, any>;
}

class RegisterPluginDto {
  manifest: PluginManifest;
}

@Controller('plugins')
@UseGuards(JwtAuthGuard)
export class PluginController {
  constructor(private readonly pluginRegistry: PluginRegistryService) {}

  @Get()
  @RequirePermissions(Permission.SETTINGS_READ)
  @UseGuards(RbacGuard)
  list(@Query('type') type?: string) {
    return this.pluginRegistry.list(type as any);
  }

  @Post('register')
  @RequirePermissions(Permission.SETTINGS_UPDATE)
  @UseGuards(RbacGuard)
  register(@Body() dto: RegisterPluginDto) {
    return this.pluginRegistry.register(dto.manifest);
  }

  @Post(':id/activate')
  @RequirePermissions(Permission.SETTINGS_UPDATE)
  @UseGuards(RbacGuard)
  activate(@Param('id') id: string, @Body() dto: ActivatePluginDto) {
    return this.pluginRegistry.activate(id, dto.config);
  }

  @Post(':id/deactivate')
  @RequirePermissions(Permission.SETTINGS_UPDATE)
  @UseGuards(RbacGuard)
  deactivate(@Param('id') id: string) {
    return this.pluginRegistry.deactivate(id);
  }

  @Delete(':id')
  @RequirePermissions(Permission.SETTINGS_UPDATE)
  @UseGuards(RbacGuard)
  remove(@Param('id') id: string) {
    return this.pluginRegistry.unregister(id);
  }
}
