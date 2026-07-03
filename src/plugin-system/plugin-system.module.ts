import { Module } from '@nestjs/common';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginController } from './plugin.controller';

@Module({
  controllers: [PluginController],
  providers: [PluginRegistryService],
  exports: [PluginRegistryService],
})
export class PluginSystemModule {}
