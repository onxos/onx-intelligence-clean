import * as crypto from 'crypto';

export type RequestAuditContext = {
  requestId: string;
  ip?: string;
  userAgent?: string;
};

export function getRequestAuditContext(req: any): RequestAuditContext {
  const headerRequestId = req?.headers?.['x-request-id'];
  const requestId =
    (typeof headerRequestId === 'string' && headerRequestId.trim()) ||
    (typeof req?.id === 'string' && req.id.trim()) ||
    crypto.randomUUID();

  const forwardedFor = req?.headers?.['x-forwarded-for'];
  const ip =
    (typeof req?.ip === 'string' && req.ip) ||
    (typeof forwardedFor === 'string' && forwardedFor.split(',')[0].trim()) ||
    undefined;

  const userAgent =
    (typeof req?.headers?.['user-agent'] === 'string' && req.headers['user-agent']) || undefined;

  return {
    requestId,
    ip,
    userAgent,
  };
}
