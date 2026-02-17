import {
  MapRouteSegment,
  Transportation,
  type MapTravelData,
  type MapTravelLocation
} from '@/app/types';

type RouteLike = {
  id: string;
  from: string;
  to: string;
  transportType?: string;
  type?: string;
  fromCoords?: [number, number];
  toCoords?: [number, number];
  fromCoordinates?: [number, number];
  toCoordinates?: [number, number];
  date?: string | Date;
  departureTime?: string | Date;
  privateNotes?: string;
  routePoints?: [number, number][];
  subRoutes?: RouteLike[];
};

const resolveCoords = (
  primary?: [number, number],
  legacy?: [number, number]
): [number, number] => primary || legacy || [0, 0];

const resolveTransportType = (route: RouteLike): string => route.transportType || route.type || 'other';

const resolveDate = (route: RouteLike): string => {
  const value = route.date || route.departureTime;
  if (!value) return '';
  return value instanceof Date ? value.toISOString() : value;
};

const toDateString = (value?: string | Date): string | undefined => {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
};

export const toMapRouteSegment = (route: Transportation | RouteLike): MapRouteSegment => {
  const routeLike = route as RouteLike;

  return {
    id: routeLike.id,
    from: routeLike.from,
    to: routeLike.to,
    fromCoords: resolveCoords(routeLike.fromCoords, routeLike.fromCoordinates),
    toCoords: resolveCoords(routeLike.toCoords, routeLike.toCoordinates),
    transportType: resolveTransportType(routeLike),
    date: resolveDate(routeLike),
    duration: '',
    notes: routeLike.privateNotes || '',
    routePoints: routeLike.routePoints,
    subRoutes: routeLike.subRoutes?.map((segment) => toMapRouteSegment(segment))
  };
};

type MapTravelDataLike = Omit<MapTravelData, 'startDate' | 'endDate' | 'locations' | 'routes' | 'createdAt'> & {
  startDate?: string | Date;
  endDate?: string | Date;
  createdAt?: string | Date;
  locations?: Array<Omit<MapTravelLocation, 'date' | 'endDate'> & {
    date?: string | Date;
    endDate?: string | Date;
  }>;
  routes?: Array<Transportation | RouteLike | MapRouteSegment>;
};

export const normalizeMapTravelData = (travelData: MapTravelDataLike): MapTravelData => ({
  ...travelData,
  startDate: toDateString(travelData.startDate) || '',
  endDate: toDateString(travelData.endDate) || '',
  createdAt: toDateString(travelData.createdAt) || '',
  locations: (travelData.locations || []).map(location => ({
    ...location,
    date: toDateString(location.date) || '',
    endDate: toDateString(location.endDate)
  })),
  routes: (travelData.routes || []).map(route => toMapRouteSegment(route as Transportation | RouteLike))
});
