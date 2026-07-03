/**
 * ONX Plugin System — Core Interface
 * Allows dynamic addition of AI providers and tools without code changes
 */

export interface Plugin {
  id: string;
  name: string;
  version: string;
  type: PluginType;
  status: PluginStatus;
  config: Record<string, any>;
  register(): Promise<void>;
  unregister(): Promise<void>;
}

export type PluginType = 'AI_PROVIDER' | 'CONNECTOR' | 'TOOL' | 'NOTIFICATION';

export type PluginStatus = 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'PENDING_CONFIG';

export interface AIProviderPlugin extends Plugin {
  type: 'AI_PROVIDER';
  chat(messages: ChatMessage[], config?: any): Promise<ChatResponse>;
  supportsStreaming: boolean;
  models: string[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason: string;
}

export interface ConnectorPlugin extends Plugin {
  type: 'CONNECTOR';
  send(to: string, content: string, options?: any): Promise<SendResult>;
  receive(handler: (message: any) => Promise<void>): void;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ToolPlugin extends Plugin {
  type: 'TOOL';
  execute(action: string, params: Record<string, any>): Promise<any>;
  actions: string[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  type: PluginType;
  author: string;
  description: string;
  icon?: string;
  requiredEnvVars: string[];
  configSchema: ConfigSchemaField[];
  permissions: string[];
  entryPoint: string; // Path to the plugin file
}

export interface ConfigSchemaField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'secret';
  required: boolean;
  description: string;
  default?: any;
  options?: string[]; // For select type
}
