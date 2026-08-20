import {
  boundsCoveringSectors,
  sectorCacheKey,
  sectorForPoint,
  sectorsForBounds,
  sectorZoomForMapZoom
} from './map-sectors';

describe('map sectors', () => {
  it('uses a stable sector zoom between fractional map zoom updates', () => {
    expect(sectorZoomForMapZoom(12.1)).toBe(11);
    expect(sectorZoomForMapZoom(12.9)).toBe(11);
    expect(sectorZoomForMapZoom(4)).toBe(5);
  });

  it('covers a viewport with deterministic XYZ sectors', () => {
    const bounds = { west: 20.9, south: 52.19, east: 21.12, north: 52.27 };
    const sectors = sectorsForBounds(bounds, 11);
    const coverage = boundsCoveringSectors(sectors);

    expect(sectors.length).toBeGreaterThan(0);
    expect(coverage.west).toBeLessThanOrEqual(bounds.west);
    expect(coverage.south).toBeLessThanOrEqual(bounds.south);
    expect(coverage.east).toBeGreaterThanOrEqual(bounds.east);
    expect(coverage.north).toBeGreaterThanOrEqual(bounds.north);
    expect(sectors).toContainEqual(
      expect.objectContaining({
        ...sectorForPoint(21.0122, 52.2297, 11),
        zoom: 11
      })
    );
  });

  it('builds readable versioned cache keys', () => {
    expect(sectorCacheKey(7, 0, 'ALL', { zoom: 11, x: 1143, y: 671 })).toBe('reach-v2:v7:0:ALL:11:1143:671');
  });
});
