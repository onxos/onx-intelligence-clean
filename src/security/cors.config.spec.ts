import { allowedOrigins, buildCorsOptions, isOriginAllowed } from './cors.config';

describe('cors config', () => {
  afterEach(() => {
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  it('allows known origins', () => {
    expect(isOriginAllowed('https://onx.app')).toBe(true);
    expect(isOriginAllowed('https://app.onx.app')).toBe(true);
    expect(isOriginAllowed('http://localhost:3000')).toBe(true);
  });

  it('allows requests without an Origin header (server-to-server)', () => {
    expect(isOriginAllowed(undefined)).toBe(true);
  });

  it('blocks unknown origins', () => {
    expect(isOriginAllowed('https://evil.example.com')).toBe(false);
  });

  it('extends the whitelist from env', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://partner.app, https://two.app';
    expect(allowedOrigins()).toContain('https://partner.app');
    expect(isOriginAllowed('https://two.app')).toBe(true);
  });

  it('origin callback approves allowed origins', () => {
    const opts = buildCorsOptions();
    const cb = jest.fn();
    (opts.origin as any)('https://onx.app', cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('origin callback rejects blocked origins', () => {
    const opts = buildCorsOptions();
    const cb = jest.fn();
    (opts.origin as any)('https://evil.example.com', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });

  it('restricts methods and headers', () => {
    const opts = buildCorsOptions();
    expect(opts.credentials).toBe(true);
    expect(opts.methods).toContain('POST');
    expect(opts.allowedHeaders).toContain('Authorization');
  });
});
