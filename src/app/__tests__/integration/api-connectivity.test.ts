/**
 * API Connectivity Test
 * 
 * Tests whether external APIs (like OSRM) are accessible in the current environment.
 * If not accessible, sets up mocking for integration tests.
 */

import { generateRoutePoints } from '../../lib/routeUtils';
import { isExternalApiAvailable } from '../utils/mockRouteUtils';

const TEST_ROUTE = {
  id: 'connectivity-test',
  type: 'car' as const,
  from: 'London',
  to: 'Paris', 
  fromCoordinates: [51.5074, -0.1278] as [number, number],
  toCoordinates: [48.8566, 2.3522] as [number, number]
};

// Expected coordinates that OSRM actually returns (recorded from actual API responses)
// OSRM returns [lng, lat] but our code converts to [lat, lng]
const EXPECTED_OSRM_START = [51.507478, -0.127965];
const EXPECTED_OSRM_END = [48.857243, 2.352316];

const MOCK_ROUTE_POINTS: [number, number][] = [
  [51.5074, -0.1278], // London
  [51.4, -0.5],       // Intermediate point 1
  [51.1, -1.0],       // Intermediate point 2
  [50.8, -1.5],       // Intermediate point 3
  [50.5, -2.0],       // Intermediate point 4
  [50.2, -2.5],       // Intermediate point 5
  [49.9, -1.8],       // Intermediate point 6
  [49.6, -1.2],       // Intermediate point 7
  [49.3, -0.5],       // Intermediate point 8
  [49.0, 0.2],        // Intermediate point 9
  [48.8566, 2.3522]   // Paris
];

describe('API Connectivity Test', () => {
  let externalApiAvailable = false;
  
  beforeAll(async () => {
    console.log('🔍 Testing OSRM API connectivity...');
    externalApiAvailable = await isExternalApiAvailable();
    console.log(`🌐 External API availability: ${externalApiAvailable}`);
  });
  
  it('should detect external API availability', () => {
    expect(typeof externalApiAvailable).toBe('boolean');
    console.log(`📊 API Status: ${externalApiAvailable ? 'Available' : 'Unavailable'}`);
  });
  
  it('should generate route points regardless of API availability', async () => {
    console.log('🔄 Testing route generation...');
    
    const routePoints = await generateRoutePoints(TEST_ROUTE);
    
    expect(routePoints).toBeDefined();
    expect(Array.isArray(routePoints)).toBe(true);
    expect(routePoints.length).toBeGreaterThan(0);
    
    // Verify first and last points match what OSRM actually returns (with tolerance for API changes)
    if (externalApiAvailable) {
      expect(routePoints[0][0]).toBeCloseTo(EXPECTED_OSRM_START[0], 3);
      expect(routePoints[0][1]).toBeCloseTo(EXPECTED_OSRM_START[1], 3);
      expect(routePoints[routePoints.length - 1][0]).toBeCloseTo(EXPECTED_OSRM_END[0], 3);
      expect(routePoints[routePoints.length - 1][1]).toBeCloseTo(EXPECTED_OSRM_END[1], 3);
    } else {
      // For mock data, use our original coordinates
      expect(routePoints[0]).toEqual(TEST_ROUTE.fromCoordinates);
      expect(routePoints[routePoints.length - 1]).toEqual(TEST_ROUTE.toCoordinates);
    }
    
    if (externalApiAvailable) {
      console.log(`✅ Generated ${routePoints.length} route points via external API`);
      // With external API, we should get more than just 2 points
      expect(routePoints.length).toBeGreaterThan(2);
    } else {
      console.log(`✅ Generated ${routePoints.length} route points via fallback`);
      // Without external API, we might get just start/end points
      expect(routePoints.length).toBeGreaterThanOrEqual(2);
    }
  });
  
  it('should provide mock data for tests when API is unavailable', () => {
    if (!externalApiAvailable) {
      console.log('🔄 Setting up mock route data...');
      
      // Store mock data in global for other tests to use
      (global as typeof globalThis & { __MOCK_ROUTE_POINTS__?: [number, number][] }).__MOCK_ROUTE_POINTS__ = MOCK_ROUTE_POINTS;
      
      expect(MOCK_ROUTE_POINTS).toHaveLength(11);
      expect(MOCK_ROUTE_POINTS[0]).toEqual([51.5074, -0.1278]); // London
      expect(MOCK_ROUTE_POINTS[MOCK_ROUTE_POINTS.length - 1]).toEqual([48.8566, 2.3522]); // Paris
      
      console.log('✅ Mock route data prepared for other tests');
    } else {
      console.log('✅ External API available, no mocking needed');
    }
  });
});