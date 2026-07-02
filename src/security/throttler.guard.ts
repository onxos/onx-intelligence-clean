import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { THROTTLE_METADATA } from './throttle.decorator';
import { THROTTLER_CONFIG, ThrottleOptions } from './throttler.config';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Dependency-free, in-memory rate-limiting guard (STOP #3: no Redis). Each
 * (ip, controller, handler) pair gets its own fixed-window counter. In the test
 * runtime it is inert unless the policy opts in via `enforceInTest`, so the
 * existing e2e suite is never throttled.
 *
 * TODO(prod): back the store with Redis for multi-instance deployments.
 */
@Injectable()
export class ThrottlerGuard implements CanActivate {
  private static readonly store = new Map<string, Bucket>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options: ThrottleOptions =
      this.reflector.getAllAndOverride<ThrottleOptions>(THROTTLE_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? THROTTLER_CONFIG.default;

    if (process.env.DISABLE_THROTTLER === '1') return true;
    if (process.env.NODE_ENV === 'test' && !options.enforceInTest) return true;

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const ip = extractIp(req);
    const key = `${ip}:${context.getClass().name}:${context.getHandler().name}`;
    const now = Date.now();

    let bucket = ThrottlerGuard.store.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.ttl * 1000 };
      ThrottlerGuard.store.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(0, options.limit - bucket.count);
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('X-RateLimit-Limit', String(options.limit));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    }

    if (bucket.count > options.limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  /** Clear all counters (test isolation). */
  static reset(): void {
    ThrottlerGuard.store.clear();
  }
}

function extractIp(req: {
  ips?: string[];
  ip?: string;
  socket?: { remoteAddress?: string };
}): string {
  return req?.ips?.[0] ?? req?.ip ?? req?.socket?.remoteAddress ?? 'unknown';
}
