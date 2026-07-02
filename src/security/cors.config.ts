import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Phase 4 — CORS whitelist. Only known origins may call the API with
 * credentials. Extendable via the CORS_ALLOWED_ORIGINS env var (comma list).
 */
export const DEFAULT_ALLOWED_ORIGINS = [
  'https://onx.app',
  'https://app.onx.app',
  // The workspace UI is served from the same host as the API (under /w), so the
  // deploy's own origin must be allowed — browsers send it as the Origin header
  // on every POST, and a disallowed origin would otherwise 500 the request.
  'https://onx-intelligence-clean.onrender.com',
  'http://localhost:3000',
];

export function allowedOrigins(): string[] {
  const extra = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  // Render provides RENDER_EXTERNAL_URL as this service's public URL; keep the
  // whitelist correct even if the service is renamed.
  const renderUrl = (process.env.RENDER_EXTERNAL_URL ?? '')
    .trim()
    .replace(/\/$/, '');
  const dynamic = renderUrl ? [renderUrl] : [];
  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...dynamic, ...extra])];
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
