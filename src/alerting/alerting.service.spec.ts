import { AlertingService } from './alerting.service';
import { AlertChannel } from './alerting.constants';

describe('AlertingService', () => {
  const service = new AlertingService();
  const originalFetch = global.fetch;

  afterEach(() => {
    delete process.env.SLACK_WEBHOOK_URL;
    delete process.env.PAGERDUTY_WEBHOOK_URL;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('does not dispatch when the channel is unconfigured', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await service.dispatch(AlertChannel.SLACK, { title: 't', severity: 'critical' });
    expect(result.dispatched).toBe(false);
    expect(result.reason).toBe('channel_unconfigured');
  });

  it('POSTs to the webhook when configured', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.example/slack';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const result = await service.dispatch(AlertChannel.SLACK, { title: 't', severity: 'warning' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.example/slack',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.dispatched).toBe(true);
  });

  it('reports dispatch errors gracefully', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.example/slack';
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as any;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await service.dispatch(AlertChannel.SLACK, { title: 't', severity: 'warning' });
    expect(result.dispatched).toBe(false);
    expect(result.reason).toBe('dispatch_error');
  });

  it('onViolation uses the slack channel with critical severity', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await service.onViolation({ constraintId: 'HC-05', severity: 'CRITICAL' });
    expect(result.channel).toBe(AlertChannel.SLACK);
  });

  it('onProviderDown alerts on slack', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await service.onProviderDown('openai');
    expect(result.channel).toBe(AlertChannel.SLACK);
  });

  it('onSechConflict pages via pagerduty', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await service.onSechConflict({ conflictClass: 'PRIORITY' });
    expect(result.channel).toBe(AlertChannel.PAGERDUTY);
  });
});
