import { StructuredLogger } from './structured-logger.service';

describe('StructuredLogger', () => {
  afterEach(() => jest.restoreAllMocks());

  it('emits a JSON envelope for info', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    StructuredLogger.info('fic check approved', { workspaceId: 'ws-1', constraintId: 'HC-02' });
    const payload = JSON.parse(spy.mock.calls[0][0] as string);
    expect(payload).toMatchObject({
      level: 'info',
      message: 'fic check approved',
      service: 'onx-intelligence',
      workspaceId: 'ws-1',
      constraintId: 'HC-02',
    });
    expect(payload.timestamp).toBeDefined();
  });

  it('routes warnings to console.warn', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    StructuredLogger.warn('degraded');
    expect(spy).toHaveBeenCalled();
    expect(JSON.parse(spy.mock.calls[0][0] as string).level).toBe('warn');
  });

  it('routes errors to console.error', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    StructuredLogger.error('boom', { traceId: 't-1' });
    const payload = JSON.parse(spy.mock.calls[0][0] as string);
    expect(payload.level).toBe('error');
    expect(payload.traceId).toBe('t-1');
  });
});
