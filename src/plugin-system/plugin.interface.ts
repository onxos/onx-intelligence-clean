export type PluginType = 'AI_PROVIDER' | 'CONNECTOR' | 'TOOL' | 'NOTIFICATION';
export type PluginStatus = 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'PENDING_CONFIG';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  type: PluginType;
  author: string;
  description: string;
  requiredEnvVars: string[];
  configSchema: ConfigSchemaField[];
  permissions: string[];
  entryPoint: string;
}

export interface ConfigSchemaField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'secret';
  required: boolean;
  description: string;
  default?: unknown;
  options?: string[];
}
