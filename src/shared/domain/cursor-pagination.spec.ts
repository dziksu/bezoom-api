import { BadRequestException } from '@nestjs/common';
import { decodeGeoCursor, decodeTimestampCursor, encodeGeoCursor, encodeTimestampCursor } from './cursor-pagination';

describe('cursor pagination', () => {
  const id = 'd45f5bb8-bf19-4a6f-bbab-61e338e12262';

  it('round-trips a timestamp cursor', () => {
    const timestamp = new Date('2026-08-13T12:00:00.123Z');
    const encoded = encodeTimestampCursor('comments:event', timestamp, id);

    expect(decodeTimestampCursor(encoded, 'comments:event')).toEqual({ timestamp, id });
  });

  it('rejects malformed and cross-resource timestamp cursors with a keyed error', () => {
    expect(() => decodeTimestampCursor('not-json', 'comments:event')).toThrow(BadRequestException);
    const encoded = encodeTimestampCursor('likes:event', new Date(), id);
    expect(() => decodeTimestampCursor(encoded, 'comments:event')).toThrow('CURSOR_INVALID');
  });

  it('binds a geo cursor to its search context', () => {
    const encoded = encodeGeoCursor({ distanceMeters: 123.45, id, lat: 50.0647, lng: 19.945, week: 0 });

    expect(decodeGeoCursor(encoded, { lat: 50.0647, lng: 19.945, week: 0 })).toMatchObject({
      distanceMeters: 123.45,
      id
    });
    expect(() => decodeGeoCursor(encoded, { lat: 51, lng: 19.945, week: 0 })).toThrow('CURSOR_INVALID');
  });
});
