import { detectAvatarImage } from './avatar-image';

describe('detectAvatarImage', () => {
  it.each([
    [Buffer.from('ffd8ffe000', 'hex'), 'image/jpeg'],
    [Buffer.from('89504e470d0a1a0a00', 'hex'), 'image/png'],
    [Buffer.from('524946460000000057454250', 'hex'), 'image/webp']
  ])('recognizes image bytes independently from a declared MIME', (buffer, expectedMime) => {
    expect(detectAvatarImage(buffer)?.mimeType).toBe(expectedMime);
  });

  it('rejects arbitrary content', () => {
    expect(detectAvatarImage(Buffer.from('<script>alert(1)</script>'))).toBeNull();
  });
});
