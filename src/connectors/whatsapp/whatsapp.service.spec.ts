import { WhatsAppService } from './whatsapp.service';

describe('WhatsAppService', () => {
  const makeService = () => {
    const connectors = {
      ingest: jest
        .fn()
        .mockResolvedValue({ logId: 'log-1', status: 'processed', usfipRecordId: 'r-1' }),
    } as any;
    return { connectors, service: new WhatsAppService(connectors) };
  };

  beforeEach(() => jest.clearAllMocks());

  describe('classifyMessage', () => {
    it('classifies clinical messages', () => {
      const { service } = makeService();
      const c = service.classifyMessage('my dog is vomiting and in pain');
      expect(c.domain).toBe('clinical');
      expect(c.intent).toBe('clinical');
    });

    it('flags emergencies with a signal', () => {
      const { service } = makeService();
      const c = service.classifyMessage('emergency! my cat collapsed and is bleeding');
      expect(c.domain).toBe('clinical');
      expect(c.signals.emergencyMedical).toBe(true);
    });

    it('classifies booking messages', () => {
      const { service } = makeService();
      const c = service.classifyMessage('I want to book an appointment');
      expect(c.domain).toBe('operational');
      expect(c.intent).toBe('booking');
    });

    it('classifies complaints', () => {
      const { service } = makeService();
      const c = service.classifyMessage('I want a refund, this is terrible');
      expect(c.domain).toBe('customer');
      expect(c.intent).toBe('complaint');
    });

    it('defaults to general customer', () => {
      const { service } = makeService();
      const c = service.classifyMessage('hello, what are your opening hours?');
      expect(c.intent).toBe('general');
      expect(c.domain).toBe('customer');
    });

    it('prioritizes clinical over booking when both present', () => {
      const { service } = makeService();
      const c = service.classifyMessage('my dog is sick, can I book an appointment?');
      expect(c.intent).toBe('clinical');
    });
  });

  describe('processWebhook', () => {
    it('ingests an inbound message at tier 2 with classification', async () => {
      const { service, connectors } = makeService();
      await service.processWebhook('ws-1', {
        MessageSid: 'SM1',
        From: 'whatsapp:+15550001',
        To: 'whatsapp:+15559999',
        Body: 'my dog is limping',
      });
      expect(connectors.ingest).toHaveBeenCalledWith(
        expect.objectContaining({
          connector: 'whatsapp',
          provider: 'twilio',
          eventType: 'incoming_webhook',
          perception: expect.objectContaining({
            domain: 'clinical',
            sourceId: 'whatsapp:+15550001',
          }),
        }),
        undefined,
      );
    });

    it('filters delivery status callbacks', async () => {
      const { service, connectors } = makeService();
      await service.processWebhook('ws-1', { MessageSid: 'SM2', MessageStatus: 'delivered' });
      expect(connectors.ingest).toHaveBeenCalledWith(
        expect.objectContaining({ filteredReason: 'status_update:delivered' }),
        undefined,
      );
    });

    it('passes the external id through', async () => {
      const { service, connectors } = makeService();
      await service.processWebhook('ws-1', { MessageSid: 'SM3', From: 'x', Body: 'hi' });
      expect(connectors.ingest).toHaveBeenCalledWith(
        expect.objectContaining({ externalId: 'SM3' }),
        undefined,
      );
    });
  });
});
