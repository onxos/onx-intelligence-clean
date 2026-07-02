/** Twilio WhatsApp connector constants + keyword classifier vocabulary. */

export const WHATSAPP_PROVIDER = 'twilio';

export const BOOKING_KEYWORDS = [
  'book',
  'booking',
  'appointment',
  'schedule',
  'reserve',
  'reschedule',
  'availability',
];

export const CLINICAL_KEYWORDS = [
  'sick',
  'vomit',
  'vomiting',
  'diarrhea',
  'pain',
  'bleeding',
  'injured',
  'injury',
  'not eating',
  'lethargic',
  'limping',
  'seizure',
  'collapse',
  'my dog',
  'my cat',
  'my pet',
];

export const EMERGENCY_KEYWORDS = [
  'emergency',
  'bleeding',
  'collapse',
  'seizure',
  'unconscious',
  'poison',
];

export const COMPLAINT_KEYWORDS = [
  'complaint',
  'complain',
  'refund',
  'angry',
  'terrible',
  'worst',
  'unhappy',
  'disappointed',
  'rude',
];

export const WHATSAPP_STATUS_EVENTS = ['delivered', 'read', 'failed', 'sent', 'undelivered'];
