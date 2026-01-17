import type { MapRouteSegment } from '@/app/types';

export const getLeafMapRouteSegments = (route: MapRouteSegment): MapRouteSegment[] => {
  if (!route.subRoutes?.length) return [route];
  return route.subRoutes.flatMap(getLeafMapRouteSegments);
};

export const resolveMapRouteSegmentPoints = (segment: MapRouteSegment): [number, number][] => {
  if (segment.routePoints?.length) {
    return segment.routePoints;
  }

  return [segment.fromCoords, segment.toCoords];
};

