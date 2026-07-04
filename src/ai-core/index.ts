// Barrel exports — AI types exported from ai-router.service to avoid duplication
export * from './ai-router.service';
export * from './ai-core.module';
export * from './ai-core.service';
// NOTE: AICompletionContext, AIMessage exported from ai-router.service
// Do NOT re-export from ai-core.types to avoid TS2308 ambiguity
export { AIProvider, AIResponse } from './ai-core.types';
