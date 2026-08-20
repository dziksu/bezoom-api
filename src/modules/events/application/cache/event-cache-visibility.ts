import type { Event } from '../../domain/event.aggregate';

/**
 * Mirrors the stable lifecycle predicates used by public discovery queries.
 * Time and viewport predicates are intentionally omitted so invalidation stays
 * conservative when a published event changes or leaves discovery.
 */
export function isEventMapVisible(event: Event): boolean {
  return (
    event.status === 'PUBLISHED' &&
    event.mediaPipelineStatus === 'READY' &&
    event.verificationStatus === 'VERIFIED' &&
    event.visibility === 'PUBLIC' &&
    !event.archivedAt
  );
}
