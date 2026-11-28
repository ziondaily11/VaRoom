// What a venue booking is for (docs/host-controls/CALENDAR_EVENTS_PLAN.md):
// the guest picks one when booking a venue, the host sees it on the request
// and the calendar. The database allows the same values (migration 000097,
// with the same words in varoom_event_label).

export const EVENT_TYPES = [
  { value: 'wedding', label: 'Wedding' },
  { value: 'traditional', label: 'Traditional ceremony (ruracio, ngurario…)' },
  { value: 'graduation', label: 'Graduation' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'corporate', label: 'Corporate event' },
  { value: 'conference', label: 'Conference or meeting' },
  { value: 'religious', label: 'Church or religious event' },
  { value: 'baby_shower', label: 'Baby shower' },
  { value: 'memorial', label: 'Memorial' },
  { value: 'concert', label: 'Concert or show' },
  { value: 'shoot', label: 'Photo or video shoot' },
  { value: 'party', label: 'Party' },
  { value: 'other', label: 'Other' },
] as const;

export type EventType = typeof EVENT_TYPES[number]['value'];
export const EVENT_NOTES_MAX = 500;

/** The short name shown on the calendar and to the host ("Traditional ceremony", "Event" for Other); null when there is none. */
export function eventLabel(value: string | null | undefined): string | null {
  const found = EVENT_TYPES.find((t) => t.value === value);
  if (!found) return null;
  return found.value === 'other' ? 'Event' : found.label.replace(/ \(.*\)$/, '');
}
