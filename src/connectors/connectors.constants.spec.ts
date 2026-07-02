import {
  CONNECTOR_DOMAIN,
  CONNECTOR_SOURCE_TYPE,
  CONNECTOR_TIER,
  CONNECTOR_TYPES,
  DG04_DISCOUNT_THRESHOLD,
  SC09_NOTICE_HOURS,
  isConnector,
  providerAllowed,
} from './connectors.constants';

describe('connectors constants', () => {
  it('defines the 4 connectors', () => {
    expect(CONNECTOR_TYPES).toEqual(['whatsapp', 'emr', 'pos', 'calendar']);
  });

  it('maps each connector to a valid bus source type (calendar → manual)', () => {
    expect(CONNECTOR_SOURCE_TYPE.whatsapp).toBe('whatsapp');
    expect(CONNECTOR_SOURCE_TYPE.emr).toBe('emr');
    expect(CONNECTOR_SOURCE_TYPE.pos).toBe('pos');
    expect(CONNECTOR_SOURCE_TYPE.calendar).toBe('manual');
  });

  it('assigns AC-05 tiers: EMR/POS tier 1, WhatsApp/Calendar tier 2', () => {
    expect(CONNECTOR_TIER.emr).toBe(1);
    expect(CONNECTOR_TIER.pos).toBe(1);
    expect(CONNECTOR_TIER.whatsapp).toBe(2);
    expect(CONNECTOR_TIER.calendar).toBe(2);
  });

  it('assigns default domains', () => {
    expect(CONNECTOR_DOMAIN.whatsapp).toBe('customer');
    expect(CONNECTOR_DOMAIN.emr).toBe('clinical');
    expect(CONNECTOR_DOMAIN.pos).toBe('commercial');
    expect(CONNECTOR_DOMAIN.calendar).toBe('operational');
  });

  it('isConnector guards the connector set', () => {
    expect(isConnector('whatsapp')).toBe(true);
    expect(isConnector('sms')).toBe(false);
  });

  it('providerAllowed validates provider per connector', () => {
    expect(providerAllowed('whatsapp', 'twilio')).toBe(true);
    expect(providerAllowed('whatsapp', 'square')).toBe(false);
    expect(providerAllowed('emr', 'vettriage')).toBe(true);
    expect(providerAllowed('emr', 'kantime')).toBe(true);
    expect(providerAllowed('pos', 'stripe')).toBe(true);
    expect(providerAllowed('calendar', 'google')).toBe(true);
  });

  it('exposes DG-04 and SC-09 thresholds', () => {
    expect(DG04_DISCOUNT_THRESHOLD).toBe(30);
    expect(SC09_NOTICE_HOURS).toBe(48);
  });
});
