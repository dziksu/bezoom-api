export const RSVP_STATUSES = ['MAYBE', 'CONFIRMED', 'DECLINED'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];
