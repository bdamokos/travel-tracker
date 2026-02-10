type RouteSegmentLike = {
  from?: string;
  to?: string;
  fromCoords?: [number, number];
  toCoords?: [number, number];
  distanceOverride?: number;
};

export type CompositeRouteLike = RouteSegmentLike & {
  id?: string;
  subRoutes?: RouteSegmentLike[];
};

export type CompositeRouteValidationError =
  | { code: 'from_mismatch' }
  | { code: 'to_mismatch' }
  | { code: 'from_coords_mismatch' }
  | { code: 'to_coords_mismatch' }
  | { code: 'disconnected_segment'; segmentNumber: number };

export type CompositeRouteValidationResult =
  | { ok: true; normalizedRoute: CompositeRouteLike }
  | { ok: false; error: CompositeRouteValidationError };

// Allow sub-meter coordinate drift from serialization/geocoding differences.
const COORD_EPSILON = 1e-6;

const normalizeLocationName = (value?: string) => value?.trim().toLowerCase() || '';

const isSameLocationName = (left?: string, right?: string) => {
  if (!left || !right) return false;
  return normalizeLocationName(left) === normalizeLocationName(right);
};

const isSameCoords = (left?: [number, number], right?: [number, number]) => {
  if (!left || !right) return false;
  return Math.abs(left[0] - right[0]) < COORD_EPSILON && Math.abs(left[1] - right[1]) < COORD_EPSILON;
};

const findDisconnectedSegmentNumber = (subRoutes: RouteSegmentLike[]): number | null => {
  for (let index = 1; index < subRoutes.length; index += 1) {
    const previous = subRoutes[index - 1];
    const current = subRoutes[index];
    const namesMatch = isSameLocationName(previous.to, current.from);

    if (previous.to && current.from && !namesMatch) {
      return index + 1;
    }

    // If location names are unavailable, fall back to coordinate continuity.
    if (!namesMatch && previous.toCoords && current.fromCoords && !isSameCoords(previous.toCoords, current.fromCoords)) {
      return index + 1;
    }
  }

  return null;
};

export const validateAndNormalizeCompositeRoute = (route: CompositeRouteLike): CompositeRouteValidationResult => {
  const subRoutes = route.subRoutes;
  if (!subRoutes?.length) {
    return { ok: true, normalizedRoute: route };
  }

  const first = subRoutes[0];
  const last = subRoutes[subRoutes.length - 1];
  const routeStartMatches = isSameLocationName(route.from, first.from);
  const routeEndMatches = isSameLocationName(route.to, last.to);

  if (route.from && first.from && !routeStartMatches) {
    return { ok: false, error: { code: 'from_mismatch' } };
  }

  if (route.to && last.to && !routeEndMatches) {
    return { ok: false, error: { code: 'to_mismatch' } };
  }

  if (route.from && first.from && route.fromCoords && first.fromCoords && !routeStartMatches && !isSameCoords(route.fromCoords, first.fromCoords)) {
    return { ok: false, error: { code: 'from_coords_mismatch' } };
  }

  if (route.to && last.to && route.toCoords && last.toCoords && !routeEndMatches && !isSameCoords(route.toCoords, last.toCoords)) {
    return { ok: false, error: { code: 'to_coords_mismatch' } };
  }

  const disconnectedSegmentNumber = findDisconnectedSegmentNumber(subRoutes);
  if (disconnectedSegmentNumber) {
    return { ok: false, error: { code: 'disconnected_segment', segmentNumber: disconnectedSegmentNumber } };
  }

  return {
    ok: true,
    normalizedRoute: {
      ...route,
      from: first.from,
      to: last.to,
      fromCoords: first.fromCoords ?? route.fromCoords,
      toCoords: last.toCoords ?? route.toCoords
    }
  };
};
