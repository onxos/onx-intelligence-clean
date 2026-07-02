import type { Request, Response, NextFunction } from 'express';

/**
 * Phase 4 — HTTP security headers (dependency-free helmet equivalent).
 * Mirrors the hardened header set: CSP, HSTS, no-sniff, frame protection,
 * referrer policy, and X-Powered-By removal.
 */
export const HELMET_CONFIG = {
  contentSecurityPolicy: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' wss: https:",
    "frame-ancestors 'self'",
  ].join('; '),
  hsts: 'max-age=31536000; includeSubDomains; preload',
  referrerPolicy: 'strict-origin-when-cross-origin',
};

/** Express middleware that applies the security headers on every response. */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Security-Policy', HELMET_CONFIG.contentSecurityPolicy);
  res.setHeader('Strict-Transport-Security', HELMET_CONFIG.hsts);
  res.setHeader('Referrer-Policy', HELMET_CONFIG.referrerPolicy);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('X-XSS-Protection', '0');
  res.removeHeader('X-Powered-By');
  next();
}
