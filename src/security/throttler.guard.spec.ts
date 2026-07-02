import { HttpException } from '@nestjs/common';
import { ThrottlerGuard } from './throttler.guard';

function makeContext(handlerName = 'h', className = 'C', ip = '1.2.3.4') {
  const res = { setHeader: jest.fn() };
  const req = { ip };
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getHandler: () => ({ name: handlerName }),
    getClass: () => ({ name: className }),
    _res: res,
  } as any;
}

const reflector = (opts: unknown) =>
  ({ getAllAndOverride: jest.fn().mockReturnValue(opts) }) as any;

describe('ThrottlerGuard', () => {
  beforeEach(() => ThrottlerGuard.reset());
  afterEach(() => {
    delete process.env.DISABLE_THROTTLER;
  });

  it('allows requests under the limit', () => {
    const g = new ThrottlerGuard(reflector({ ttl: 60, limit: 3, enforceInTest: true }));
    const c = makeContext();
    expect(g.canActivate(c)).toBe(true);
    expect(g.canActivate(c)).toBe(true);
    expect(g.canActivate(c)).toBe(true);
  });

  it('throws 429 once the limit is exceeded', () => {
    const g = new ThrottlerGuard(reflector({ ttl: 60, limit: 2, enforceInTest: true }));
    const c = makeContext();
    g.canActivate(c);
    g.canActivate(c);
    expect(() => g.canActivate(c)).toThrow(HttpException);
  });

  it('sets X-RateLimit headers', () => {
    const g = new ThrottlerGuard(reflector({ ttl: 60, limit: 5, enforceInTest: true }));
    const c = makeContext();
    g.canActivate(c);
    expect(c._res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
    expect(c._res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
  });

  it('isolates counters per handler', () => {
    const g = new ThrottlerGuard(reflector({ ttl: 60, limit: 1, enforceInTest: true }));
    expect(g.canActivate(makeContext('a'))).toBe(true);
    expect(g.canActivate(makeContext('b'))).toBe(true);
  });

  it('isolates counters per IP', () => {
    const g = new ThrottlerGuard(reflector({ ttl: 60, limit: 1, enforceInTest: true }));
    expect(g.canActivate(makeContext('h', 'C', '1.1.1.1'))).toBe(true);
    expect(g.canActivate(makeContext('h', 'C', '2.2.2.2'))).toBe(true);
  });

  it('is inert under NODE_ENV=test without enforceInTest', () => {
    const g = new ThrottlerGuard(reflector({ ttl: 60, limit: 1 }));
    const c = makeContext();
    expect(g.canActivate(c)).toBe(true);
    expect(g.canActivate(c)).toBe(true);
    expect(g.canActivate(c)).toBe(true);
  });

  it('honours DISABLE_THROTTLER', () => {
    process.env.DISABLE_THROTTLER = '1';
    const g = new ThrottlerGuard(reflector({ ttl: 60, limit: 1, enforceInTest: true }));
    const c = makeContext();
    g.canActivate(c);
    g.canActivate(c);
    expect(g.canActivate(c)).toBe(true);
  });

  it('falls back to the default policy when no metadata is present', () => {
    const g = new ThrottlerGuard(reflector(undefined));
    // default has no enforceInTest → inert in test
    const c = makeContext();
    expect(g.canActivate(c)).toBe(true);
  });
});
