import { securityHeadersMiddleware } from './helmet.config';

describe('securityHeadersMiddleware', () => {
  const run = () => {
    const res = { setHeader: jest.fn(), removeHeader: jest.fn() } as any;
    const next = jest.fn();
    securityHeadersMiddleware({} as any, res, next);
    return { res, next };
  };

  it('sets a content security policy', () => {
    const { res } = run();
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining("default-src 'self'"),
    );
  });

  it('sets HSTS with preload', () => {
    const { res } = run();
    expect(res.setHeader).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      expect.stringContaining('preload'),
    );
  });

  it('sets no-sniff and frame protection', () => {
    const { res } = run();
    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'SAMEORIGIN');
  });

  it('removes X-Powered-By', () => {
    const { res } = run();
    expect(res.removeHeader).toHaveBeenCalledWith('X-Powered-By');
  });

  it('calls next', () => {
    const { next } = run();
    expect(next).toHaveBeenCalled();
  });
});
