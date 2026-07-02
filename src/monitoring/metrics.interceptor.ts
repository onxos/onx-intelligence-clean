import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { metrics } from './metrics.registry';

/**
 * Global interceptor that records request counts + durations. Route labels use
 * the matched route pattern (not the concrete URL) to bound label cardinality.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const start = Date.now();
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const method = req?.method ?? 'UNKNOWN';
    const route = req?.route?.path ?? `${context.getClass()?.name}.${context.getHandler()?.name}`;

    const record = (status: number) => {
      try {
        const seconds = (Date.now() - start) / 1000;
        metrics.httpRequestsTotal.inc({ method, route, status: String(status) });
        metrics.httpRequestDuration.observe({ method, route }, seconds);
      } catch {
        // Metrics must never break a request.
      }
    };

    return next.handle().pipe(
      tap({
        next: () => record(res?.statusCode ?? 200),
        error: (err) => record(err?.status ?? 500),
      }),
    );
  }
}
