/**
 * Queue names used throughout the BeZoom API.
 * Centralised here so producers and consumers share a single source of truth.
 */
export enum QueueName {
  TEXT_MODERATION = 'text-moderation',
  MEDIA_MODERATION = 'media-moderation',
  MEDIA_PROCESSING = 'media-processing',
  NOTIFICATIONS = 'notifications'
}
