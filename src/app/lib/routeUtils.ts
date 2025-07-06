import { Transportation } from '../types';

// Colors for different transportation types
export const transportationColors = {
  walk: '#4CAF50',    // Green
  bus: '#2196F3',     // Blue
  train: '#F44336',   // Red
  plane: '#9C27B0',   // Purple
  car: '#FF9800',     // Orange
  ferry: '#03A9F4',   // Light Blue
  bike: '#8BC34A',    // Light Green
  other: '#607D8B',   // Grey Blue
};

// Line styles for different transportation types
export const getRouteStyle = (type: Transportation['type']) => {
  switch (type) {
    case 'walk':
      return {
        color: transportationColors.walk,
        weight: 3,
        opacity: 0.8,
        dashArray: '5, 5',  // Dashed line for walking
      };
    case 'bus':
      return {
        color: transportationColors.bus,
        weight: 4,
        opacity: 0.8,
      };
    case 'train':
      return {
        color: transportationColors.train,
        weight: 5,
        opacity: 0.8,
        dashArray: '10, 5',  // Dashed line for train
      };
    case 'plane':
      return {
        color: transportationColors.plane,
        weight: 3,
        opacity: 0.6,
        dashArray: '10, 10',  // Dotted line for plane
      };
    case 'car':
      return {
        color: transportationColors.car,
        weight: 4,
        opacity: 0.8,
      };
    case 'ferry':
      return {
        color: transportationColors.ferry,
        weight: 4,
        opacity: 0.7,
        dashArray: '15, 5',  // Dashed line for ferry
      };
    case 'bike':
      return {
        color: transportationColors.bike,
        weight: 3,
        opacity: 0.8,
        dashArray: '5, 3',  // Small dashed line for bike
      };
    case 'other':
    default:
      return {
        color: transportationColors.other,
        weight: 3,
        opacity: 0.7,
      };
  }
};

// Convert degrees to radians
const toRadians = (degrees: number): number => degrees * Math.PI / 180;

// Convert radians to degrees
const toDegrees = (radians: number): number => radians * 180 / Math.PI;

// Calculate great circle route between two points on Earth
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
    case 'other':
    default:
      return 'car';
  }
};

// Generate route points based on transportation type
export const generateRoutePoints = async (
  transportation: Transportation
): Promise<[number, number][]> => {
  const { type, fromCoordinates, toCoordinates } = transportation;
  
  // Handle case where coordinates are undefined
  if (!fromCoordinates || !toCoordinates) {
    return [];
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
      // Use simple arc for ferries (less precise but appropriate for water routes)
      routePoints = calculateSimpleArc(
        fromCoordinates,
        toCoordinates,
        15,
        0.15
      );
      break;
    case 'train':
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
  const { type, fromCoordinates, toCoordinates } = transportation;
  
  // Handle case where coordinates are undefined
  if (!fromCoordinates || !toCoordinates) {
    return [];
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
      return calculateSimpleArc(fromCoordinates, toCoordinates, 15, 0.15);
    case 'train':
    case 'bus':
    case 'car':
    case 'walk':
    case 'bike':
    case 'other':
    default:
      return [fromCoordinates, toCoordinates];
  }
}; 