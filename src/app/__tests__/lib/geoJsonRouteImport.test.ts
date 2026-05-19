import {
  MAX_GEOJSON_ROUTE_IMPORT_BYTES,
  parseGeoJsonRouteImport,
  validateGeoJsonRouteImportFile
} from '@/app/lib/geoJsonRouteImport';
import { MAX_ROUTE_POINTS_PER_ROUTE } from '@/app/lib/routePointValidation';

describe('geoJsonRouteImport', () => {
  it('extracts and converts LineString coordinates from GeoJSON', () => {
    const points = parseGeoJsonRouteImport(JSON.stringify({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [4.3517, 50.8503],
          [2.3522, 48.8566]
        ]
      }
    }));

    expect(points).toEqual([
      [50.8503, 4.3517],
      [48.8566, 2.3522]
    ]);
  });

  it('rejects files above the import byte limit before reading them', () => {
    expect(() => validateGeoJsonRouteImportFile({
      name: 'huge.geojson',
      size: MAX_GEOJSON_ROUTE_IMPORT_BYTES + 1
    })).toThrow('huge.geojson is too large');
  });

  it('rejects routes above the route point limit', () => {
    const coordinates = Array.from(
      { length: MAX_ROUTE_POINTS_PER_ROUTE + 1 },
      (_, index) => [4 + index / 1000000, 50 + index / 1000000]
    );

    expect(() => parseGeoJsonRouteImport(JSON.stringify({
      type: 'LineString',
      coordinates
    }))).toThrow(`GeoJSON route cannot contain more than ${MAX_ROUTE_POINTS_PER_ROUTE} points`);
  });

  it('rejects route points outside valid latitude and longitude ranges', () => {
    expect(() => parseGeoJsonRouteImport(JSON.stringify({
      type: 'LineString',
      coordinates: [
        [4.3517, 50.8503],
        [2.3522, 91]
      ]
    }))).toThrow('GeoJSON route[1] must be a valid [latitude, longitude] pair');
  });

  it('rejects GeoJSON without a LineString geometry', () => {
    expect(() => parseGeoJsonRouteImport(JSON.stringify({
      type: 'Point',
      coordinates: [4.3517, 50.8503]
    }))).toThrow('No LineString coordinates found in GeoJSON');
  });
});
