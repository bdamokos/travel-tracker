/**
 * Mock Route Utils for Testing
 * 
 * Provides conditional mocking for route generation based on external API availability
 */

import { Transportation } from '@/app/types';

// Mock route data for different transportation types
export const MOCK_ROUTE_DATA: Record<string, [number, number][]> = {
  'car-51.5074,-0.1278-48.8566,2.3522': [
    [51.5074, -0.1278], // London
    [51.4, -0.5],       // Via M25
    [51.1, -1.0],       // Via M40
    [50.8, -1.5],       // Via A34
    [50.5, -2.0],       // Approaching Channel
    [50.2, -2.5],       // Channel crossing area
    [49.9, -1.8],       // French coast
    [49.6, -1.2],       // Via A26
    [49.3, -0.5],       // Via A1
    [49.0, 0.2],        // Approaching Paris
    [48.8566, 2.3522]   // Paris
  ],
  'train-51.5074,-0.1278-48.8566,2.3522': [
    [51.5074, -0.1278], // London St Pancras
    [51.4656, -0.1089], // London suburbs
    [51.3, -0.5],       // Kent countryside
    [51.1, 0.3],        // Ashford area
    [51.0089, 1.1648],  // Calais area
    [50.9, 1.8],        // French countryside
    [50.4, 2.0],        // Amiens area
    [49.5, 2.1],        // Approaching Paris
    [48.8566, 2.3522]   // Paris Gare du Nord
  ],
  'plane-51.5074,-0.1278-48.8566,2.3522': [
    [51.5074, -0.1278], // London
    [51.2, -0.5],       // Takeoff trajectory
    [51.0, -0.8],       // Climb
    [50.5, -1.0],       // Cruise altitude over Channel
    [50.0, 0.0],        // Mid-Channel
    [49.5, 1.0],        // Approach France
    [49.2, 1.5],        // Descent
    [49.0, 2.0],        // Final approach
    [48.8566, 2.3522]   // Paris CDG
  ]
};

// Generate route key for mocking
export const generateMockRouteKey = (
  type: Transportation['type'],
  from: [number, number],
  to: [number, number]
): string => {
  return `${type}-${from[0]},${from[1]}-${to[0]},${to[1]}`;
};

// Get mock route points
export const getMockRoutePoints = (
  transportation: Transportation
): [number, number][] => {
  const { type, fromCoordinates, toCoordinates } = transportation;
  
  if (!fromCoordinates || !toCoordinates) {
    return [];
  }
  
  const key = generateMockRouteKey(type, fromCoordinates, toCoordinates);
  
  // Return specific mock data if available
  if (MOCK_ROUTE_DATA[key]) {
    return MOCK_ROUTE_DATA[key];
  }
  
  // Generate fallback mock data based on type
  switch (type) {
    case 'plane':
      return generateGreatCircleMock(fromCoordinates, toCoordinates, 9);
    case 'ferry':
    case 'boat':
      return generateArcMock(fromCoordinates, toCoordinates, 7);
    default:
      return generateLandRouteMock(fromCoordinates, toCoordinates, 8);
  }
};

// Generate mock great circle route (for planes)
const generateGreatCircleMock = (
  start: [number, number],
  end: [number, number],
  points: number
): [number, number][] => {
  const result: [number, number][] = [start];
  
  for (let i = 1; i < points - 1; i++) {
    const ratio = i / (points - 1);
    const lat = start[0] + (end[0] - start[0]) * ratio;
    const lng = start[1] + (end[1] - start[1]) * ratio;
    // Add slight arc for realistic great circle appearance
    const arc = Math.sin(ratio * Math.PI) * 0.5;
    result.push([lat + arc, lng]);
  }
  
  result.push(end);
  return result;
};

// Generate mock arc route (for ferries)
const generateArcMock = (
  start: [number, number],
  end: [number, number],
  points: number
): [number, number][] => {
  const result: [number, number][] = [start];
  
  for (let i = 1; i < points - 1; i++) {
    const ratio = i / (points - 1);
    const lat = start[0] + (end[0] - start[0]) * ratio;
    const lng = start[1] + (end[1] - start[1]) * ratio;
    // Add perpendicular bend for ferry route
    const bend = Math.sin(ratio * Math.PI) * 0.2;
    result.push([lat + bend, lng - bend]);
  }
  
  result.push(end);
  return result;
};

// Generate mock land route (for cars, trains, etc.)
const generateLandRouteMock = (
  start: [number, number],
  end: [number, number],
  points: number
): [number, number][] => {
  const result: [number, number][] = [start];
  
  for (let i = 1; i < points - 1; i++) {
    const ratio = i / (points - 1);
    const lat = start[0] + (end[0] - start[0]) * ratio;
    const lng = start[1] + (end[1] - start[1]) * ratio;
    // Add small random variations for realistic land route
    const variation = (Math.random() - 0.5) * 0.1;
    result.push([lat + variation, lng + variation]);
  }
  
  result.push(end);
  return result;
};

// Setup route mocking for tests
export const setupRouteMocking = () => {
  const mockGenerateRoutePoints = jest.fn().mockImplementation((transportation: Transportation) => {
    console.log(`🔧 Using mock route generation for ${transportation.type} route`);
    return Promise.resolve(getMockRoutePoints(transportation));
  });
  
  // Mock the route utils module
  jest.doMock('../../lib/routeUtils', () => ({
    ...jest.requireActual('../../lib/routeUtils'),
    generateRoutePoints: mockGenerateRoutePoints
  }));
  
  return mockGenerateRoutePoints;
};

// Check if external API is available (test it directly)
export const isExternalApiAvailable = async (): Promise<boolean> => {
  if (process.env.TEST_FORCE_MOCK_ROUTES === 'true') {
    (global as typeof globalThis & { __EXTERNAL_API_AVAILABLE__?: boolean }).__EXTERNAL_API_AVAILABLE__ = false;
    return false;
  }

  // Check if we've already tested in this test run
  const cached = (global as typeof globalThis & { __EXTERNAL_API_AVAILABLE__?: boolean }).__EXTERNAL_API_AVAILABLE__;
  if (cached !== undefined) {
    return cached;
  }
  
  // Test OSRM API connectivity with a short timeout
  try {
    const testUrl = 'https://router.project-osrm.org/route/v1/car/-0.1278,51.5074;2.3522,48.8566?overview=full&geometries=geojson';
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
    
    const response = await fetch(testUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Travel-Tracker-Test'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      const available = !!(data.routes && data.routes[0]);
      
      // Cache the result
      (global as typeof globalThis & { __EXTERNAL_API_AVAILABLE__?: boolean }).__EXTERNAL_API_AVAILABLE__ = available;
      return available;
    }
  } catch {
    // API not available
  }
  
  // Cache negative result
  (global as typeof globalThis & { __EXTERNAL_API_AVAILABLE__?: boolean }).__EXTERNAL_API_AVAILABLE__ = false;
  return false;
};
