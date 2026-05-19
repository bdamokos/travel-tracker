export type RoutePoint = [number, number];

export const MAX_ROUTE_POINTS_PER_ROUTE = 100000;
export const MAX_ROUTE_POINTS_PER_UPDATE = 250000;
export const MAX_RAIL_GRAPH_ELEMENTS = 50000;
export const MAX_RAIL_GRAPH_NODES = 40000;
export const MAX_RAIL_GRAPH_EDGES = 100000;

type RoutePointValidationResult =
  | { ok: true; points: RoutePoint[] }
  | { ok: false; error: string };

const isValidRoutePoint = (point: unknown): point is RoutePoint => {
  if (!Array.isArray(point) || point.length !== 2) {
    return false;
  }

  const [lat, lng] = point;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
};

export const validateRoutePoints = (
  points: unknown,
  label = 'routePoints'
): RoutePointValidationResult => {
  if (points === undefined || points === null) {
    return { ok: true, points: [] };
  }

  if (!Array.isArray(points)) {
    return { ok: false, error: `${label} must be an array` };
  }

  if (points.length > MAX_ROUTE_POINTS_PER_ROUTE) {
    return {
      ok: false,
      error: `${label} cannot contain more than ${MAX_ROUTE_POINTS_PER_ROUTE} points`
    };
  }

  for (let index = 0; index < points.length; index += 1) {
    if (!isValidRoutePoint(points[index])) {
      return { ok: false, error: `${label}[${index}] must be a valid [latitude, longitude] pair` };
    }
  }

  return { ok: true, points: points as RoutePoint[] };
};
