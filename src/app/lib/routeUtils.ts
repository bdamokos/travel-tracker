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

// Calculate intermediate points for air and sea routes
export const calculateIntermediatePoints = (
  startPoint: [number, number],
  endPoint: [number, number],
  numPoints: number = 10,
  bendFactor: number = 0.2
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

// Generate route points based on transportation type
export const generateRoutePoints = (
  transportation: Transportation
): [number, number][] => {
  const { type, fromCoordinates, toCoordinates } = transportation;
  
  switch (type) {
    case 'plane':
    case 'ferry':
      // Use curved line for air and sea routes
      return calculateIntermediatePoints(
        fromCoordinates,
        toCoordinates,
        type === 'plane' ? 20 : 15,
        type === 'plane' ? 0.3 : 0.15
      );
    case 'train':
    case 'bus':
    case 'car':
    case 'walk':
    case 'bike':
    case 'other':
    default:
      // For land routes, just use a straight line for now
      // In a real application, you would use a routing API here
      return [fromCoordinates, toCoordinates];
  }
}; 