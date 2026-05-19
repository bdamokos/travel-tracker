import {
  MAX_ROUTE_POINTS_PER_ROUTE,
  RoutePoint,
  validateRoutePoints
} from '@/app/lib/routePointValidation';

export const MAX_GEOJSON_ROUTE_IMPORT_BYTES = 20 * 1024 * 1024;

type GeoJsonImportFile = Pick<File, 'name' | 'size'>;

export const validateGeoJsonRouteImportFile = (file: GeoJsonImportFile): void => {
  if (file.size > MAX_GEOJSON_ROUTE_IMPORT_BYTES) {
    throw new Error(
      `${file.name} is too large. GeoJSON imports are limited to ${Math.floor(MAX_GEOJSON_ROUTE_IMPORT_BYTES / (1024 * 1024))} MB.`
    );
  }
};

const toLatLng = (pair: unknown): RoutePoint | null => {
  if (!Array.isArray(pair) || pair.length < 2) {
    return null;
  }

  const [lng, lat] = pair;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }

  return [lat, lng];
};

const pickLine = (geometry: unknown): unknown[] | null => {
  if (!geometry || typeof geometry !== 'object') {
    return null;
  }

  const geom = geometry as { type?: unknown; coordinates?: unknown };
  if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
    return geom.coordinates;
  }

  if (
    geom.type === 'MultiLineString' &&
    Array.isArray(geom.coordinates) &&
    Array.isArray((geom.coordinates as unknown[])[0])
  ) {
    return (geom.coordinates as unknown[])[0] as unknown[];
  }

  return null;
};

const normalizeCoordinates = (coords: unknown[]): RoutePoint[] | null => {
  if (coords.length > MAX_ROUTE_POINTS_PER_ROUTE) {
    throw new Error(`GeoJSON route cannot contain more than ${MAX_ROUTE_POINTS_PER_ROUTE} points`);
  }

  const normalized = coords.map(toLatLng).filter((value): value is RoutePoint => Boolean(value));
  if (!normalized.length) {
    return null;
  }

  const validation = validateRoutePoints(normalized, 'GeoJSON route');
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  return validation.points;
};

export const extractGeoJsonRoutePoints = (geojson: unknown): RoutePoint[] | null => {
  if (
    geojson &&
    typeof geojson === 'object' &&
    (geojson as { type?: unknown }).type === 'FeatureCollection'
  ) {
    const features = (geojson as { features?: unknown }).features;
    if (Array.isArray(features)) {
      for (const feature of features) {
        const geometry = (feature as { geometry?: unknown }).geometry;
        const coords = pickLine(geometry);
        if (coords) {
          const normalized = normalizeCoordinates(coords);
          if (normalized) {
            return normalized;
          }
        }
      }
    }
  }

  if (geojson && typeof geojson === 'object' && (geojson as { type?: unknown }).type === 'Feature') {
    const geometry = (geojson as { geometry?: unknown }).geometry;
    const coords = pickLine(geometry);
    if (coords) {
      return normalizeCoordinates(coords);
    }
  }

  if (geojson && typeof geojson === 'object') {
    const type = (geojson as { type?: unknown }).type;
    if (type === 'LineString' || type === 'MultiLineString') {
      const coords = pickLine(geojson);
      if (coords) {
        return normalizeCoordinates(coords);
      }
    }
  }

  return null;
};

export const parseGeoJsonRouteImport = (text: string): RoutePoint[] => {
  const parsed = JSON.parse(text) as unknown;
  const routePoints = extractGeoJsonRoutePoints(parsed);

  if (!routePoints || routePoints.length === 0) {
    throw new Error('No LineString coordinates found in GeoJSON');
  }

  return routePoints;
};
