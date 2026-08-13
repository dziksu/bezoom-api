import { BadRequestException } from '@nestjs/common';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CURSOR_LENGTH = 1024;

interface TimestampCursorPayload {
  kind: string;
  timestamp: string;
  id: string;
}

export interface TimestampCursor {
  timestamp: Date;
  id: string;
}

export interface GeoCursor {
  distanceMeters: number;
  id: string;
  lat: number;
  lng: number;
  week: number | null;
}

export function encodeTimestampCursor(kind: string, timestamp: Date, id: string): string {
  return encode({ kind, timestamp: timestamp.toISOString(), id });
}

export function decodeTimestampCursor(cursor: string | undefined, kind: string): TimestampCursor | undefined {
  if (!cursor) return undefined;
  const payload = decode(cursor) as Partial<TimestampCursorPayload>;
  const timestamp = typeof payload.timestamp === 'string' ? new Date(payload.timestamp) : undefined;

  if (
    payload.kind !== kind ||
    !timestamp ||
    Number.isNaN(timestamp.getTime()) ||
    typeof payload.id !== 'string' ||
    !UUID_PATTERN.test(payload.id)
  ) {
    throw new BadRequestException('CURSOR_INVALID');
  }

  return { timestamp, id: payload.id };
}

export function encodeGeoCursor(cursor: GeoCursor): string {
  return encode({
    kind: 'event_search',
    distanceMeters: cursor.distanceMeters,
    id: cursor.id,
    lat: cursor.lat,
    lng: cursor.lng,
    week: cursor.week
  });
}

export function decodeGeoCursor(
  cursor: string | undefined,
  context: { lat: number; lng: number; week?: number }
): GeoCursor | undefined {
  if (!cursor) return undefined;
  const payload = decode(cursor) as Partial<GeoCursor> & { kind?: string };

  if (
    payload.kind !== 'event_search' ||
    typeof payload.distanceMeters !== 'number' ||
    !Number.isFinite(payload.distanceMeters) ||
    payload.distanceMeters < 0 ||
    typeof payload.id !== 'string' ||
    !UUID_PATTERN.test(payload.id) ||
    payload.lat !== context.lat ||
    payload.lng !== context.lng ||
    payload.week !== (context.week ?? null)
  ) {
    throw new BadRequestException('CURSOR_INVALID');
  }

  return {
    distanceMeters: payload.distanceMeters,
    id: payload.id,
    lat: payload.lat,
    lng: payload.lng,
    week: payload.week
  };
}

function encode(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decode(cursor: string): unknown {
  if (cursor.length > MAX_CURSOR_LENGTH) throw new BadRequestException('CURSOR_INVALID');
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new BadRequestException('CURSOR_INVALID');
  }
}
