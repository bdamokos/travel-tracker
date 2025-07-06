import { generateRoutePoints } from './routeUtils';
import { Transportation } from '../types';

// Preload routes for a journey to populate the cache
export const preloadRoutes = async (routes: Array<{
  transportType: string;
  fromCoords: [number, number];
  toCoords: [number, number];
  from: string;
  to: string;
  id?: string;
}>): Promise<void> => {
  const promises = routes.map(async (route) => {
    try {
      const transportation: Transportation = {
        id: route.id || 'route',
        type: route.transportType as Transportation['type'],
        from: route.from,
        to: route.to,
        fromCoordinates: route.fromCoords,
        toCoordinates: route.toCoords
      };
      
      await generateRoutePoints(transportation);
    } catch (error) {
      console.warn('Failed to preload route:', route.from, 'to', route.to, error);
    }
  });
  
  await Promise.allSettled(promises);
};

// Preload routes from journey data structure
export const preloadJourneyRoutes = async (days: Array<{
  transportation?: Transportation;
}>): Promise<void> => {
  const routes = days
    .filter(day => day.transportation && day.transportation.fromCoordinates && day.transportation.toCoordinates)
    .map(day => ({
      id: day.transportation!.id,
      transportType: day.transportation!.type,
      fromCoords: day.transportation!.fromCoordinates!,
      toCoords: day.transportation!.toCoordinates!,
      from: day.transportation!.from,
      to: day.transportation!.to
    }));
  
  await preloadRoutes(routes);
};