import { CalendarService, parseCalendarEvent } from './calendar.service';

describe('parseCalendarEvent', () => {
  it('parses a Google-style event and computes hoursUntil', () => {
    const start = new Date(Date.now() + 24 * 3600_000).toISOString();
    const e = parseCalendarEvent({
      id: 'g-1',
      summary: 'Checkup',
      start: { dateTime: start },
      status: 'confirmed',
    });
    expect(e.externalId).toBe('g-1');
    expect(e.title).toBe('Checkup');
    expect(e.isModified).toBe(false);
    expect(e.hoursUntil).toBeGreaterThan(20);
    expect(e.hoursUntil).toBeLessThan(26);
  });

  it('detects a modified event', () => {
    const e = parseCalendarEvent({
      id: 'g-2',
      title: 'Surgery',
      start: new Date().toISOString(),
      status: 'modified',
    });
    expect(e.isModified).toBe(true);
  });

  it('handles a missing start', () => {
    const e = parseCalendarEvent({ id: 'g-3', title: 'x' });
    expect(e.hoursUntil).toBe(9999);
  });
});

describe('CalendarService', () => {
  const makeService = () => {
    const connectors = {
      ingest: jest
        .fn()
        .mockResolvedValue({ logId: 'log-1', status: 'processed', usfipRecordId: 'r-1' }),
      markSync: jest.fn().mockResolvedValue(undefined),
    } as any;
    return { connectors, service: new CalendarService(connectors) };
  };

  beforeEach(() => jest.clearAllMocks());

  it('syncs mock events at tier 2 operational', async () => {
    const { service, connectors } = makeService();
    const result = await service.sync('ws-1', {});
    expect(result.ingested).toBe(2);
    expect(connectors.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        connector: 'calendar',
        perception: expect.objectContaining({ domain: 'operational', tier: 2 }),
      }),
      undefined,
    );
    expect(connectors.markSync).toHaveBeenCalledWith('ws-1', 'calendar', 'google');
  });

  it('flags SC-09 short-notice modifications', async () => {
    const { service, connectors } = makeService();
    const soon = new Date(Date.now() + 6 * 3600_000).toISOString();
    await service.sync('ws-1', {
      records: [{ id: 'e-1', title: 'Moved surgery', start: soon, status: 'modified' }],
    });
    expect(connectors.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        perception: expect.objectContaining({ signals: { scheduleChangeShortNotice: true } }),
      }),
      undefined,
    );
  });

  it('does not flag a modification with adequate notice', async () => {
    const { service, connectors } = makeService();
    const later = new Date(Date.now() + 96 * 3600_000).toISOString();
    await service.sync('ws-1', {
      records: [{ id: 'e-2', title: 'Moved', start: later, status: 'modified' }],
    });
    const call = connectors.ingest.mock.calls[0][0];
    expect(call.perception.signals).toEqual({});
  });
});
