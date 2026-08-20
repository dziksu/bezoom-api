export interface MapSectorBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface MapSector {
  zoom: number;
  x: number;
  y: number;
  bounds: MapSectorBounds;
}

const MAX_MERCATOR_LATITUDE = 85.05112878;
const BOUNDS_EPSILON = 1e-9;

export function sectorZoomForMapZoom(mapZoom: number): number {
  return Math.max(5, Math.floor(mapZoom) - 1);
}

export function sectorsForBounds(bounds: MapSectorBounds, zoom: number): MapSector[] {
  const { westX, eastX, northY, southY } = sectorRangeForBounds(bounds, zoom);
  const sectors: MapSector[] = [];

  for (let x = westX; x <= eastX; x += 1) {
    for (let y = northY; y <= southY; y += 1) {
      sectors.push({ zoom, x, y, bounds: tileBounds(x, y, zoom) });
    }
  }
  return sectors;
}

/** Returns the allocation size before sectors are materialized. */
export function countSectorsForBounds(bounds: MapSectorBounds, zoom: number): number {
  const { westX, eastX, northY, southY } = sectorRangeForBounds(bounds, zoom);
  return (eastX - westX + 1) * (southY - northY + 1);
}

export function sectorCacheKey(
  version: number,
  week: number | string | undefined,
  scope: 'CITY_PLUS' | 'ALL',
  sector: Pick<MapSector, 'zoom' | 'x' | 'y'>
): string {
  // v4 stores compact pins with the required cover URL and no backend clustering.
  return `map-v4:v${version}:${week ?? 'all'}:${scope}:${sector.zoom}:${sector.x}:${sector.y}`;
}

export function boundsCoveringSectors(sectors: MapSector[]): MapSectorBounds {
  if (sectors.length === 0) throw new Error('MAP_SECTORS_EMPTY');
  return {
    west: Math.min(...sectors.map((sector) => sector.bounds.west)),
    south: Math.min(...sectors.map((sector) => sector.bounds.south)),
    east: Math.max(...sectors.map((sector) => sector.bounds.east)),
    north: Math.max(...sectors.map((sector) => sector.bounds.north))
  };
}

export function sectorForPoint(longitude: number, latitude: number, zoom: number): Pick<MapSector, 'x' | 'y'> {
  return {
    x: longitudeToTileX(longitude, zoom),
    y: latitudeToTileY(latitude, zoom)
  };
}

function longitudeToTileX(longitude: number, zoom: number): number {
  const tiles = 2 ** zoom;
  return Math.max(0, Math.min(tiles - 1, Math.floor(((longitude + 180) / 360) * tiles)));
}

function latitudeToTileY(latitude: number, zoom: number): number {
  const tiles = 2 ** zoom;
  const constrained = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude));
  const radians = (constrained * Math.PI) / 180;
  const projected = (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2;
  return Math.max(0, Math.min(tiles - 1, Math.floor(projected * tiles)));
}

function tileBounds(x: number, y: number, zoom: number): MapSectorBounds {
  const tiles = 2 ** zoom;
  return {
    west: (x / tiles) * 360 - 180,
    east: ((x + 1) / tiles) * 360 - 180,
    north: tileYToLatitude(y, tiles),
    south: tileYToLatitude(y + 1, tiles)
  };
}

function tileYToLatitude(y: number, tiles: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / tiles))) * 180) / Math.PI;
}

function sectorRangeForBounds(bounds: MapSectorBounds, zoom: number) {
  return {
    westX: longitudeToTileX(bounds.west, zoom),
    eastX: longitudeToTileX(bounds.east - BOUNDS_EPSILON, zoom),
    northY: latitudeToTileY(bounds.north - BOUNDS_EPSILON, zoom),
    southY: latitudeToTileY(bounds.south + BOUNDS_EPSILON, zoom)
  };
}
