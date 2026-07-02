import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Phase 4 — CORS whitelist. Only known origins may call the API with
 * credentials. Extendable via the CORS_ALLOWED_ORIGINS env var (comma list).
 */
export const DEFAULT_ALLOWED_ORIGINS = [
  'https://onx.app',
  'https://app.onx.app',
  'http://localhost:3000',
];

export function allowedOrigins(): string[] {
  const extra = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra])];
}

export function isOriginAllowed(origin: string | undefined): boolean {
  // Same-origin / server-to-server requests have no Origin header.
  return !origin || allowedOrigins().includes(origin);
}

export function buildCorsOptions(): CorsOptions {
  return {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id'],
  };
}
