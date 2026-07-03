/**
 * ONX Plugin System — Registry Service
 * Manages plugin registration, lifecycle, and discovery
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Plugin,
  PluginManifest,
  PluginStatus,
  PluginType,
  AIProviderPlugin,
} from './plugin.interface';

@Injectable()
export class PluginRegistryService {
  private readonly logger = new Logger(PluginRegistryService.name);
  private plugins: Map<string, Plugin> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register a new plugin from manifest
   */
  async register(manifest: PluginManifest): Promise<Plugin> {
    this.logger.log(`Registering plugin: ${manifest.id} (${manifest.type})`);

    // Check if already registered
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} is already registered`);
    }

    // Validate required env vars
    for (const envVar of manifest.requiredEnvVars) {
      if (!process.env[envVar]) {
        this.logger.warn(`Missing env var: ${envVar} for plugin ${manifest.id}`);
      }
    }

    // Store in database
    await this.prisma.plugin.upsert({
      where: { id: manifest.id },
      update: {
        name: manifest.name,
        version: manifest.version,
        type: manifest.type,
        status: 'PENDING_CONFIG',
        config: {},
        manifest: manifest as any,
      },
      create: {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        type: manifest.type,
        status: 'PENDING_CONFIG',
        config: {},
        manifest: manifest as any,
      },
    });

    // Create plugin instance (lazy-loaded)
    const plugin = await this.instantiatePlugin(manifest);
    this.plugins.set(manifest.id, plugin);

    return plugin;
  }

  /**
   * Activate a plugin with configuration
   */
  async activate(pluginId: string, config: Record<string, any>): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

    // Update config
    await this.prisma.plugin.update({
      where: { id: pluginId },
      data: { config, status: 'ACTIVE' },
    });

    plugin.config = { ...plugin.config, ...config };
    plugin.status = 'ACTIVE';

    await plugin.register();
    this.logger.log(`Plugin ${pluginId} activated`);
  }

  /**
   * Deactivate a plugin
   */
  async deactivate(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    await plugin.unregister();
    plugin.status = 'INACTIVE';

    await this.prisma.plugin.update({
      where: { id: pluginId },
      data: { status: 'INACTIVE' },
    });

    this.logger.log(`Plugin ${pluginId} deactivated`);
  }

  /**
   * Get all plugins
   */
  async list(type?: PluginType): Promise<Plugin[]> {
    const all = Array.from(this.plugins.values());
    return type ? all.filter(p => p.type === type) : all;
  }

  /**
   * Get plugin by ID
   */
  get(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  /**
   * Get all AI providers
   */
  getAIProviders(): AIProviderPlugin[] {
    return Array.from(this.plugins.values())
      .filter((p): p is AIProviderPlugin => p.type === 'AI_PROVIDER' && p.status === 'ACTIVE');
  }

  /**
   * Unregister a plugin completely
   */
  async unregister(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      await plugin.unregister();
      this.plugins.delete(pluginId);
    }
    await this.prisma.plugin.deleteMany({ where: { id: pluginId } });
  }

  private async instantiatePlugin(manifest: PluginManifest): Promise<Plugin> {
    // Dynamic import of the plugin module
    try {
      const module = await import(manifest.entryPoint);
      return new module.default(manifest);
    } catch {
      // Return a placeholder plugin that can be configured later
      return {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        type: manifest.type,
        status: 'PENDING_CONFIG' as PluginStatus,
        config: {},
        register: async () => {},
        unregister: async () => {},
      } as Plugin;
    }
  }
}
