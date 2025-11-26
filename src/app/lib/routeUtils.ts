import { Transportation } from '../types';

// Transportation configuration with styles and metadata
export const transportationConfig: Record<Transportation['type'], {
  color: string;
  weight: number;
  opacity: number;
  dashArray?: string;
  description: string;
}> = {
  walk: {
    color: '#4CAF50',     // Green
    weight: 3,
    opacity: 0.8,
    dashArray: '5, 5',    // Dashed line for walking
    description: 'Walking'
  },
  bike: {
    color: '#8BC34A',     // Light Green
    weight: 3,
    opacity: 0.8,
    dashArray: '5, 3',    // Small dashed line for bike
    description: 'Bicycle'
  },
  car: {
    color: '#FF9800',     // Orange
    weight: 4,
    opacity: 0.8,
    description: 'Car'
  },
  bus: {
    color: '#2196F3',     // Blue
    weight: 4,
    opacity: 0.8,
    description: 'Bus'
  },
  train: {
    color: '#F44336',     // Red
    weight: 5,
    opacity: 0.8,
    dashArray: '10, 5',   // Dashed line for train
    description: 'Train'
  },
  metro: {
    color: '#E91E63',     // Pink
    weight: 4,
    opacity: 0.9,
    dashArray: '3, 3',    // Short dashed line for metro
    description: 'Metro/Subway'
  },
  plane: {
    color: '#9C27B0',     // Purple
    weight: 3,
    opacity: 0.6,
    dashArray: '10, 10',  // Dotted line for plane
    description: 'Airplane'
  },
  ferry: {
    color: '#03A9F4',     // Light Blue
    weight: 4,
    opacity: 0.7,
    dashArray: '15, 5',   // Dashed line for ferry
    description: 'Ferry'
  },
  boat: {
    color: '#00BCD4',     // Cyan
    weight: 4,
    opacity: 0.7,
    dashArray: '20, 5',   // Long dashed line for boat
    description: 'Boat'
  },
  other: {
    color: '#607D8B',     // Grey Blue
    weight: 3,
    opacity: 0.7,
    description: 'Other'
  }
};

// Legacy colors export for backward compatibility
export const transportationColors = Object.fromEntries(
  Object.entries(transportationConfig).map(([key, config]) => [key, config.color])
);

// Get route style for a transportation type
export const getRouteStyle = (type: Transportation['type']) => {
  const config = transportationConfig[type] || transportationConfig.other;
  return {
    color: config.color,
    weight: config.weight,
    opacity: config.opacity,
    ...(config.dashArray && { dashArray: config.dashArray })
  };
};

// Export transport types and labels for use in dropdowns and forms
export const transportationTypes = Object.keys(transportationConfig) as Transportation['type'][];
export const transportationLabels = Object.fromEntries(
  Object.entries(transportationConfig).map(([key, config]) => [key, config.description])
);

// Helper functions for coordinate calculations
const toRadians = (degrees: number) => degrees * (Math.PI / 180);
const toDegrees = (radians: number) => radians * (180 / Math.PI);

// Calculate great circle points for air routes using real spherical geometry
export const calculateGreatCirclePoints = (
  startPoint: [number, number],
  endPoint: [number, number],
  numPoints: number = 50
): [number, number][] => {
  const points: [number, number][] = [];
  
  // Convert to radians
  const lat1 = toRadians(startPoint[0]);
  const lon1 = toRadians(startPoint[1]);
  const lat2 = toRadians(endPoint[0]);
  const lon2 = toRadians(endPoint[1]);
  
  // Calculate the angular distance
  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;
  
  // Haversine formula for great circle distance
  const a = Math.sin(deltaLat / 2) ** 2 + 
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  // Generate intermediate points along the great circle
  for (let i = 0; i < numPoints; i++) {
    const f = i / (numPoints - 1);
    
    // Interpolation along great circle using spherical linear interpolation
    const A = Math.sin((1 - f) * c) / Math.sin(c);
    const B = Math.sin(f * c) / Math.sin(c);
    
    // Handle case where points are antipodal or very close
    if (!isFinite(A) || !isFinite(B)) {
      // Fall back to linear interpolation for very short distances
      const lat = lat1 + f * (lat2 - lat1);
      const lon = lon1 + f * (lon2 - lon1);
      points.push([toDegrees(lat), toDegrees(lon)]);
      continue;
    }
    
    // Calculate intermediate point using spherical interpolation
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    
    // Convert back to lat/lon
    const lat = Math.atan2(z, Math.sqrt(x ** 2 + y ** 2));
    const lon = Math.atan2(y, x);
    
    points.push([toDegrees(lat), toDegrees(lon)]);
  }
  
  return points;
};

// Calculate simple arc for ferry routes (less precise but visually appropriate)
export const calculateSimpleArc = (
  startPoint: [number, number],
  endPoint: [number, number],
  numPoints: number = 15,
  bendFactor: number = 0.15
): [number, number][] => {
  const points: [number, number][] = [];
  
  // Add starting point
  points.push(startPoint);
  
  // Calculate the middle point with a slight arc
  const midLat = (startPoint[0] + endPoint[0]) / 2;
  const midLng = (startPoint[1] + endPoint[1]) / 2;
  
  // Calculate perpendicular direction for the bend
  const dx = endPoint[1] - startPoint[1];
  const dy = endPoint[0] - startPoint[0];
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  // Bend more for longer distances
  const perpX = -dy / dist * dist * bendFactor;
  const perpY = dx / dist * dist * bendFactor;
  
  const controlPoint: [number, number] = [midLat + perpY, midLng + perpX];
  
  // Generate intermediate points along a quadratic Bezier curve
  for (let i = 1; i < numPoints - 1; i++) {
    const t = i / (numPoints - 1);
    const t1 = 1 - t;
    
    // Quadratic Bezier curve formula: B(t) = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂
    const lat = t1 * t1 * startPoint[0] + 2 * t1 * t * controlPoint[0] + t * t * endPoint[0];
    const lng = t1 * t1 * startPoint[1] + 2 * t1 * t * controlPoint[1] + t * t * endPoint[1];
    
    points.push([lat, lng]);
  }
  
  // Add ending point
  points.push(endPoint);
  
  return points;
};

// Cache for storing route results to avoid repeated API calls
const routeCache = new Map<string, [number, number][]>();

// Generate route cache key
const getRouteCacheKey = (
  type: Transportation['type'],
  from: [number, number],
  to: [number, number]
): string => {
  return `${type}-${from[0]},${from[1]}-${to[0]},${to[1]}`;
};

// Get route from OSRM API for land transport
const getOSRMRoute = async (
  fromCoords: [number, number],
  toCoords: [number, number],
  profile: 'car' | 'bike' | 'foot' = 'car'
): Promise<[number, number][]> => {
  try {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${fromCoords[1]},${fromCoords[0]};${toCoords[1]},${toCoords[0]}?overview=full&geometries=geojson`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OSRM API error: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.routes && data.routes[0] && data.routes[0].geometry) {
      // OSRM returns [longitude, latitude] but we need [latitude, longitude]
      return data.routes[0].geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
    }
    
    throw new Error('No route found');
  } catch (error) {
    console.warn('OSRM routing failed:', error);
    // Fallback to straight line
    return [fromCoords, toCoords];
  }
};

// Get OSRM profile based on transport type
const getOSRMProfile = (type: Transportation['type']): 'car' | 'bike' | 'foot' => {
  switch (type) {
    case 'bike':
      return 'bike';
    case 'walk':
      return 'foot';
    case 'car':
    case 'bus':
    case 'train':
    case 'metro':
    case 'other':
    default:
      return 'car';
  }
};

// Generate route points based on transportation type
export const generateRoutePoints = async (
  transportation: Transportation
): Promise<[number, number][]> => {
  const { type, fromCoordinates, toCoordinates, routePoints, useManualRoutePoints } = transportation;
  
  // Handle case where coordinates are undefined
  if (!fromCoordinates || !toCoordinates) {
    return [];
  }
  
  // For boats, allow manual override when provided
  if (type === 'boat' && useManualRoutePoints && routePoints?.length) {
    return routePoints;
  }
  
  // Create cache key
  const cacheKey = getRouteCacheKey(type, fromCoordinates, toCoordinates);
  
  // Check cache first
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }
  
  let routePoints: [number, number][] = [];

  switch (type) {
    case 'plane':
      // Use real great circle calculation for flights
      routePoints = calculateGreatCirclePoints(
        fromCoordinates,
        toCoordinates,
        50 // More points for smoother great circle curves
      );
      break;
    case 'ferry':
    case 'boat':
      // Use simple arc for ferries and boats (less precise but appropriate for water routes)
      routePoints = calculateSimpleArc(
        fromCoordinates,
        toCoordinates,
        15,
        0.15
      );
      break;
    case 'train':
    case 'metro':
    case 'bus':
    case 'car':
    case 'walk':
    case 'bike':
    case 'other':
    default:
      // For land routes, try to get realistic routing from OSRM
      try {
        const profile = getOSRMProfile(type);
        routePoints = await getOSRMRoute(fromCoordinates, toCoordinates, profile);
      } catch (error) {
        console.warn('Failed to get land route, using straight line:', error);
        routePoints = [fromCoordinates, toCoordinates];
      }
      break;
  }
  
  // Cache the result
  routeCache.set(cacheKey, routePoints);
  
  return routePoints;
};

// Synchronous version for backwards compatibility (uses cache or fallback)
export const generateRoutePointsSync = (
  transportation: Transportation
): [number, number][] => {
  const { type, fromCoordinates, toCoordinates, routePoints, useManualRoutePoints } = transportation;
  
  // Handle case where coordinates are undefined
  if (!fromCoordinates || !toCoordinates) {
    return [];
  }
  
  // For boats, allow manual override when provided
  if (type === 'boat' && useManualRoutePoints && routePoints?.length) {
    return routePoints;
  }
  
  // Create cache key
  const cacheKey = getRouteCacheKey(type, fromCoordinates, toCoordinates);
  
  // Check cache first
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }
  
  // If not in cache, use the appropriate calculation as fallback
  switch (type) {
    case 'plane':
      return calculateGreatCirclePoints(fromCoordinates, toCoordinates, 50);
    case 'ferry':
    case 'boat':
      return calculateSimpleArc(fromCoordinates, toCoordinates, 15, 0.15);
    case 'train':
    case 'metro':
    case 'bus':
    case 'car':
    case 'walk':
    case 'bike':
    case 'other':
    default:
      return [fromCoordinates, toCoordinates];
  }
};
