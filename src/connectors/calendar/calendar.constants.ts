import { SC09_NOTICE_HOURS } from '../connectors.constants';

/** Calendar connector constants. Maps onto the bus `manual` source type. */
export const CALENDAR_PROVIDERS = ['google', 'outlook'] as const;
export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];

export const CALENDAR_DOMAIN = 'operational';
export const CALENDAR_TIER = 2;
export const CALENDAR_SC09_HOURS = SC09_NOTICE_HOURS;

/** Built-in mock events used when no live calendar credentials are supplied. */
export function calendarMockEvents(): Record<string, unknown>[] {
  const soon = new Date(Date.now() + 12 * 3600_000).toISOString();
  const later = new Date(Date.now() + 96 * 3600_000).toISOString();
  return [
    { id: 'evt-1', title: 'Vaccination — Rocky', start: later, status: 'confirmed' },
    { id: 'evt-2', title: 'Rescheduled surgery — Max', start: soon, status: 'modified' },
  ];
}
