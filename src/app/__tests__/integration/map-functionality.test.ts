/**
 * Map Functionality Integration Tests
 * 
 * These tests build like a pyramid - each test verifies that all previous functionality
 * still works while adding new functionality to test. This ensures we catch any
 * regressions or data loss at any step in the process.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { NextRequest } from 'next/server'
import { POST as travelDataPOST, GET as travelDataGET, PUT as travelDataPUT, PATCH as travelDataPATCH } from '../../api/travel-data/route'
import { isExternalApiAvailable, getMockRoutePoints, setupRouteMocking } from '../utils/mockRouteUtils'

// Expected coordinates that OSRM actually returns for our test route
const EXPECTED_OSRM_START = [51.507478, -0.127965];
const EXPECTED_OSRM_END = [48.857243, 2.352316];

// Test data interfaces
interface TestTrip {
  id: string
  title: string
  description: string
  startDate: string
  endDate: string
}

interface TestLocation {
  id: string
  name: string
  coordinates: [number, number]
  date: string
  notes: string
}

interface TestRoute {
  id: string
  from: string
  to: string
  fromCoords: [number, number]
  toCoords: [number, number]
  transportType: string
  date: string
  duration: string
  notes: string
  routePoints?: [number, number][]
}

interface TripData {
  id: string
  title: string
  description: string
  startDate: string
  endDate: string
  travelData: {
    locations: TestLocation[]
    routes: TestRoute[]
  }
}

// Test constants
const TEST_TRIP_DATA: TestTrip = {
  id: 'test-trip-' + Date.now(),
  title: 'Test Trip for RoutePoints',
  description: 'Testing map functionality systematically',
  startDate: '2024-01-01T00:00:00.000Z',
  endDate: '2024-01-31T00:00:00.000Z'
}

const TEST_LOCATIONS: TestLocation[] = [
  {
    id: 'test-loc-1',
    name: 'London',
    coordinates: [51.5074, -0.1278],
    date: '2024-01-01T00:00:00.000Z',
    notes: 'Starting point'
  },
  {
    id: 'test-loc-2', 
    name: 'Paris',
    coordinates: [48.8566, 2.3522],
    date: '2024-01-15T00:00:00.000Z',
    notes: 'Midpoint destination'
  }
]

const TEST_ROUTE: TestRoute = {
  id: 'test-route-1',
  from: 'London',
  to: 'Paris',
  fromCoords: [51.5074, -0.1278],
  toCoords: [48.8566, 2.3522],
  transportType: 'train',
  date: '2024-01-15T00:00:00.000Z',
  duration: '2h 30min',
  notes: 'Eurostar connection'
}

const existingDataDirEnv = process.env.TRAVEL_TRACKER_DATA_DIR
const TEST_DATA_DIR = existingDataDirEnv || mkdtempSync(join(tmpdir(), 'travel-tracker-test-'))
process.env.TRAVEL_TRACKER_DATA_DIR = TEST_DATA_DIR
const shouldCleanupDataDir = !existingDataDirEnv
process.env.TEST_FORCE_MOCK_ROUTES = process.env.TEST_FORCE_MOCK_ROUTES || 'true'

const DATA_DIR = TEST_DATA_DIR

describe('Map Functionality Integration Tests (Pyramid)', () => {
  let testTripId: string
  let mockGenerateRoutePoints: jest.MockedFunction<(transportation: { id: string; type: string; from: string; to: string; fromCoordinates: [number, number]; toCoordinates: [number, number] }) => Promise<[number, number][]>> | null = null
  
  beforeAll(async () => {
    testTripId = TEST_TRIP_DATA.id
    
    // Check API availability and set up route mocking if needed
    const apiAvailable = await isExternalApiAvailable()
    if (!apiAvailable) {
      console.log('🔧 External API not available, setting up route mocking...')
      mockGenerateRoutePoints = setupRouteMocking()
    } else {
      console.log('✅ External API available, using real route generation')
    }
  })
  
  afterAll(() => {
    // Clean up mocks
    if (mockGenerateRoutePoints) {
      jest.clearAllMocks()
    }
    
    // Cleanup: Remove test trip file if it exists
    const testFilePath = join(DATA_DIR, `trip-${testTripId}.json`)
    if (existsSync(testFilePath)) {
      unlinkSync(testFilePath)
    }

    if (shouldCleanupDataDir && existsSync(DATA_DIR)) {
      rmSync(DATA_DIR, { recursive: true, force: true })
    }
  })

  // Helper function to read trip data from file system
  const readTripDataFromFile = (): TripData | null => {
    const filePath = join(DATA_DIR, `trip-${testTripId}.json`)
    if (!existsSync(filePath)) {
      return null
    }
    try {
      const content = readFileSync(filePath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      console.error('Error reading trip data:', error)
      return null
    }
  }

  // Helper function to wait for file to be written with proper data
  const waitForTripDataInFile = async (expectedChanges?: Partial<TripData>, timeoutMs = 5000): Promise<TripData> => {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeoutMs) {
      const tripData = readTripDataFromFile()
      
      if (tripData) {
        // If we have expected changes, check them
        if (expectedChanges) {
          let matches = true
          
          if (expectedChanges.title && tripData.title !== expectedChanges.title) {
            matches = false
          }
          
          if (expectedChanges.travelData?.locations && tripData.travelData?.locations?.length !== expectedChanges.travelData.locations.length) {
            matches = false
          }
          
          if (expectedChanges.travelData?.routes && tripData.travelData?.routes?.length !== expectedChanges.travelData.routes.length) {
            matches = false
          }
          
          if (matches) {
            return tripData
          }
        } else {
          // No specific expectations, just return the data
          return tripData
        }
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    throw new Error(`Timeout waiting for trip data to be written to file system after ${timeoutMs}ms`)
  }

  const callRouteHandler = async (endpoint: string, options: RequestInit = {}) => {
    const method = (options.method || 'GET').toString().toUpperCase()
    const url = new URL(`http://localhost${endpoint}`)

    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');

    const request = new NextRequest(url.toString(), {
      method,
      headers,
      body: options.body as BodyInit | null | undefined
    });

    switch (method) {
      case 'POST':
        return travelDataPOST(request)
      case 'PUT':
        return travelDataPUT(request)
      case 'PATCH':
        return travelDataPATCH(request)
      case 'GET':
      default:
        return travelDataGET(request)
    }
  }

  // Helper function to make API calls
  const apiCall = async (endpoint: string, options: RequestInit = {}) => {
    const response = await callRouteHandler(endpoint, options)
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`)
    }
    
    return response
  }

  // Test 1: Trip Creation
  describe('Test 1: Trip Creation', () => {
    it('should create a new trip via API', async () => {
      console.log('🔄 Test 1: Creating trip...')
      
      const response = await apiCall('/api/travel-data', {
        method: 'POST',
        body: JSON.stringify({
          ...TEST_TRIP_DATA,
          locations: [],
          routes: []
        })
      })
      
      const result = await response.json()
      
      // Update testTripId with the generated ID
      testTripId = result.id
      
      // Verify API response
      expect(result.success).toBe(true)
      expect(result.id).toBeDefined()
      
      console.log(`✅ Test 1: Trip created successfully with ID: ${testTripId}`)
    })

    it('should verify trip exists in file system', async () => {
      const tripData = await waitForTripDataInFile()
      
      expect(tripData).not.toBeNull()
      expect(tripData!.id).toBe(testTripId)
      expect(tripData!.title).toBe(TEST_TRIP_DATA.title)
      expect(tripData!.travelData.locations).toEqual([])
      expect(tripData!.travelData.routes).toEqual([])
      
      console.log('✅ Test 1: Trip verified in file system')
    })
  })

  // Test 2: Location Addition (+ verify trip still exists)
  describe('Test 2: Location Addition', () => {
    it('should add first location via API', async () => {
      console.log('🔄 Test 2: Adding first location...')
      
      const updatedTripData = {
        ...TEST_TRIP_DATA,
        locations: [TEST_LOCATIONS[0]],
        routes: []
      }
      
      const response = await apiCall(`/api/travel-data?id=${testTripId}`, {
        method: 'PUT',
        body: JSON.stringify(updatedTripData)
      })
      
      const result = await response.json()
      expect(result.success).toBe(true)
      
      console.log('✅ Test 2: First location added successfully')
    })

    it('should verify first location exists and trip is intact', async () => {
      const tripData = await waitForTripDataInFile({ 
        travelData: { locations: [TEST_LOCATIONS[0]], routes: [] } 
      })
      
      // Verify trip still exists
      expect(tripData).not.toBeNull()
      expect(tripData!.id).toBe(testTripId)
      expect(tripData!.title).toBe(TEST_TRIP_DATA.title)
      
      // Verify location was added
      expect(tripData!.travelData.locations).toHaveLength(1)
      expect(tripData!.travelData.locations[0].name).toBe(TEST_LOCATIONS[0].name)
      expect(tripData!.travelData.locations[0].coordinates).toEqual(TEST_LOCATIONS[0].coordinates)
      
      // Verify routes are still empty
      expect(tripData!.travelData.routes).toEqual([])
      
      console.log('✅ Test 2: First location verified in file system')
    })

    it('should add second location via API', async () => {
      console.log('🔄 Test 2: Adding second location...')
      
      const updatedTripData = {
        ...TEST_TRIP_DATA,
        locations: TEST_LOCATIONS,
        routes: []
      }
      
      const response = await apiCall(`/api/travel-data?id=${testTripId}`, {
        method: 'PUT',
        body: JSON.stringify(updatedTripData)
      })
      
      const result = await response.json()
      expect(result.success).toBe(true)
      
      console.log('✅ Test 2: Second location added successfully')
    })

    it('should verify both locations exist and trip is intact', async () => {
      const tripData = await waitForTripDataInFile({ 
        travelData: { locations: TEST_LOCATIONS, routes: [] } 
      })
      
      // Verify trip still exists
      expect(tripData).not.toBeNull()
      expect(tripData!.id).toBe(testTripId)
      expect(tripData!.title).toBe(TEST_TRIP_DATA.title)
      
      // Verify both locations exist
      expect(tripData!.travelData.locations).toHaveLength(2)
      expect(tripData!.travelData.locations[0].name).toBe(TEST_LOCATIONS[0].name)
      expect(tripData!.travelData.locations[1].name).toBe(TEST_LOCATIONS[1].name)
      
      // Verify routes are still empty
      expect(tripData!.travelData.routes).toEqual([])
      
      console.log('✅ Test 2: Both locations verified in file system')
    })
  })

  // Test 3: Route Creation with RoutePoints (+ verify all previous)
  describe('Test 3: Route Creation with RoutePoints', () => {
    it('should add route between locations via API', async () => {
      console.log('🔄 Test 3: Adding route...')
      
      // Generate RoutePoints for the test route (simulating handleRouteAdded)
      const transportation = {
        id: TEST_ROUTE.id,
        type: TEST_ROUTE.transportType as 'walk' | 'bike' | 'car' | 'bus' | 'train' | 'plane' | 'ferry' | 'boat' | 'metro' | 'other',
        from: TEST_ROUTE.from,
        to: TEST_ROUTE.to,
        fromCoordinates: TEST_ROUTE.fromCoords,
        toCoordinates: TEST_ROUTE.toCoords
      }
      
      console.log('🔄 Test 3: Generating RoutePoints...')
      let routePoints: [number, number][]
      
      if (await isExternalApiAvailable()) {
        // Use real API
        const { generateRoutePoints } = await import('../../lib/routeUtils')
        routePoints = await generateRoutePoints(transportation)
        console.log(`✅ Test 3: Generated ${routePoints.length} RoutePoints via external API`)
      } else {
        // Use mock data
        routePoints = getMockRoutePoints(transportation)
        console.log(`✅ Test 3: Generated ${routePoints.length} RoutePoints via mock data`)
      }
      
      const routeWithPoints = {
        ...TEST_ROUTE,
        routePoints: routePoints
      }
      
      const updatedTripData = {
        ...TEST_TRIP_DATA,
        id: testTripId, // Use the actual trip ID
        locations: TEST_LOCATIONS,
        routes: [routeWithPoints]
      }
      
      console.log(`📦 Test 3: Sending route with ${routeWithPoints.routePoints.length} RoutePoints`)
      
      const response = await apiCall(`/api/travel-data?id=${testTripId}`, {
        method: 'PUT',
        body: JSON.stringify(updatedTripData)
      })
      
      const result = await response.json()
      expect(result.success).toBe(true)
      
      console.log('✅ Test 3: Route added successfully')
    })

    it('should verify route exists with RoutePoints and all previous data intact', async () => {
      const tripData = await waitForTripDataInFile({ 
        travelData: { 
          locations: TEST_LOCATIONS, 
          routes: [{ ...TEST_ROUTE, routePoints: [] }] // We expect 1 route, exact routePoints will be checked separately
        } 
      })
      
      // Verify trip still exists
      expect(tripData).not.toBeNull()
      expect(tripData!.id).toBe(testTripId)
      expect(tripData!.title).toBe(TEST_TRIP_DATA.title)
      
      // Verify both locations still exist
      expect(tripData!.travelData.locations).toHaveLength(2)
      expect(tripData!.travelData.locations[0].name).toBe(TEST_LOCATIONS[0].name)
      expect(tripData!.travelData.locations[1].name).toBe(TEST_LOCATIONS[1].name)
      
      // Verify route exists
      expect(tripData!.travelData.routes).toHaveLength(1)
      const route = tripData!.travelData.routes[0]
      expect(route.from).toBe(TEST_ROUTE.from)
      expect(route.to).toBe(TEST_ROUTE.to)
      expect(route.transportType).toBe(TEST_ROUTE.transportType)
      
      // 🔍 CRITICAL CHECK: Verify RoutePoints exist
      console.log('🔍 Checking for RoutePoints...')
      if (route.routePoints) {
        console.log(`✅ Test 3: RoutePoints found! Length: ${route.routePoints.length}`)
        expect(route.routePoints).toBeDefined()
        expect(Array.isArray(route.routePoints)).toBe(true)
        expect(route.routePoints.length).toBeGreaterThan(0)
        
        // Verify routePoints are valid coordinate pairs
        route.routePoints.forEach((point) => {
          expect(Array.isArray(point)).toBe(true)
          expect(point).toHaveLength(2)
          expect(typeof point[0]).toBe('number')
          expect(typeof point[1]).toBe('number')
          expect(point[0]).toBeGreaterThan(-90)
          expect(point[0]).toBeLessThan(90)
          expect(point[1]).toBeGreaterThan(-180)
          expect(point[1]).toBeLessThan(180)
        })
      } else {
        console.log('❌ Test 3: RoutePoints NOT found!')
        throw new Error('RoutePoints should be present but are missing')
      }
      
      console.log('✅ Test 3: Route with RoutePoints verified in file system')
    })

    it('should test route generation directly', async () => {
      console.log('🔄 Test 3: Testing route generation directly...')
      
      const transportation = {
        id: TEST_ROUTE.id,
        type: TEST_ROUTE.transportType as 'walk' | 'bike' | 'car' | 'bus' | 'train' | 'plane' | 'ferry' | 'boat' | 'metro' | 'other',
        from: TEST_ROUTE.from,
        to: TEST_ROUTE.to,
        fromCoordinates: TEST_ROUTE.fromCoords,
        toCoordinates: TEST_ROUTE.toCoords
      }
      
      let routePoints: [number, number][]
      
      if (await isExternalApiAvailable()) {
        // Import and use real route generation function
        const { generateRoutePoints } = await import('../../lib/routeUtils')
        routePoints = await generateRoutePoints(transportation)
        console.log(`✅ Test 3: Direct route generation via external API - ${routePoints.length} points`)
      } else {
        // Use mock data
        routePoints = getMockRoutePoints(transportation)
        console.log(`✅ Test 3: Direct route generation via mock data - ${routePoints.length} points`)
      }
      
      expect(routePoints).toBeDefined()
      expect(Array.isArray(routePoints)).toBe(true)
      expect(routePoints.length).toBeGreaterThan(0)
      
      // Verify start and end points are correct based on API availability
      if (await isExternalApiAvailable()) {
        // OSRM returns more precise coordinates
        expect(routePoints[0][0]).toBeCloseTo(EXPECTED_OSRM_START[0], 3)
        expect(routePoints[0][1]).toBeCloseTo(EXPECTED_OSRM_START[1], 3)
        expect(routePoints[routePoints.length - 1][0]).toBeCloseTo(EXPECTED_OSRM_END[0], 3)
        expect(routePoints[routePoints.length - 1][1]).toBeCloseTo(EXPECTED_OSRM_END[1], 3)
      } else {
        // Mock data uses our test coordinates
        expect(routePoints[0]).toEqual(TEST_ROUTE.fromCoords)
        expect(routePoints[routePoints.length - 1]).toEqual(TEST_ROUTE.toCoords)
      }
    })
  })

  // Test 4: Data Persistence After Save/Reload (+ verify all previous)
  describe('Test 4: Data Persistence After Save/Reload', () => {
    it('should reload trip data via API and verify all data persists', async () => {
      console.log('🔄 Test 4: Reloading trip data via API...')
      
      // Create a fresh trip for this test
      const createResponse = await apiCall('/api/travel-data', {
        method: 'POST',
        body: JSON.stringify({
          ...TEST_TRIP_DATA,
          locations: [],
          routes: []
        })
      })
      
      const createResult = await createResponse.json()
      const tripId = createResult.id
      
      // Add locations
      const locationsResponse = await apiCall(`/api/travel-data?id=${tripId}`, {
        method: 'PUT',
        body: JSON.stringify({
          locations: TEST_LOCATIONS,
          title: TEST_TRIP_DATA.title,
          description: TEST_TRIP_DATA.description,
          startDate: TEST_TRIP_DATA.startDate,
          endDate: TEST_TRIP_DATA.endDate
        })
      })
      
      expect(locationsResponse.ok).toBe(true)
      
      // Add route with RoutePoints
      const routeData = {
        id: TEST_ROUTE.id,
        type: TEST_ROUTE.transportType as 'walk' | 'bike' | 'car' | 'bus' | 'train' | 'plane' | 'ferry' | 'boat' | 'metro' | 'other',
        from: TEST_ROUTE.from,
        to: TEST_ROUTE.to,
        fromCoordinates: TEST_ROUTE.fromCoords,
        toCoordinates: TEST_ROUTE.toCoords
      }
      
      const { generateRoutePoints } = await import('../../lib/routeUtils')
      const routePoints = await generateRoutePoints(routeData)
      const routeWithPoints = { ...routeData, routePoints }
      
      const routeResponse = await apiCall(`/api/travel-data?id=${tripId}`, {
        method: 'PUT',
        body: JSON.stringify({
          routes: [routeWithPoints],
          locations: TEST_LOCATIONS,
          title: TEST_TRIP_DATA.title,
          description: TEST_TRIP_DATA.description,
          startDate: TEST_TRIP_DATA.startDate,
          endDate: TEST_TRIP_DATA.endDate
        })
      })
      
      expect(routeResponse.ok).toBe(true)
      
      // Now test the reload
      const response = await apiCall(`/api/travel-data?id=${tripId}`)
      const tripData = await response.json()
      
      // Verify trip exists
      expect(tripData.id).toBe(tripId)
      expect(tripData.title).toBe(TEST_TRIP_DATA.title)
      
      // Verify locations persist
      expect(tripData.locations).toHaveLength(2)
      expect(tripData.locations[0].name).toBe(TEST_LOCATIONS[0].name)
      expect(tripData.locations[1].name).toBe(TEST_LOCATIONS[1].name)
      
      // Verify routes persist
      expect(tripData.routes).toHaveLength(1)
      const route = tripData.routes[0]
      expect(route.from).toBe(TEST_ROUTE.from)
      expect(route.to).toBe(TEST_ROUTE.to)
      
      // 🔍 CRITICAL CHECK: Verify RoutePoints persist after reload
      if (route.routePoints) {
        console.log(`✅ Test 4: RoutePoints persisted after reload! Length: ${route.routePoints.length}`)
        expect(route.routePoints).toBeDefined()
        expect(Array.isArray(route.routePoints)).toBe(true)
        expect(route.routePoints.length).toBeGreaterThan(0)
      } else {
        console.log('❌ Test 4: RoutePoints LOST after reload!')
        throw new Error('RoutePoints should persist after reload but are missing')
      }
      
      console.log('✅ Test 4: All data persisted after API reload')
      
      // Cleanup: Remove the test trip
      const testFilePath = join(DATA_DIR, `trip-${tripId}.json`)
      if (existsSync(testFilePath)) {
        unlinkSync(testFilePath)
      }
    })
  })

  // Test 5: Map Component Data Loading (+ verify all previous)
  describe('Test 5: Map Component Data Loading', () => {
    it('should verify map component receives RoutePoints correctly', async () => {
      console.log('🔄 Test 5: Testing map component data loading...')
      
      // Load trip data as the map component would
      const response = await apiCall(`/api/travel-data?id=${testTripId}`)
      const travelData = await response.json()
      
      // Verify the data structure matches what EmbeddableMap expects
      expect(travelData.locations).toHaveLength(2)
      expect(travelData.routes).toHaveLength(1)
      
      const route = travelData.routes[0]
      
      // 🔍 CRITICAL CHECK: Verify RoutePoints are available for map rendering
      if (route.routePoints && route.routePoints.length > 0) {
        console.log(`✅ Test 5: Map component will receive ${route.routePoints.length} RoutePoints`)
        
        // Verify the format matches what EmbeddableMap expects
        expect(Array.isArray(route.routePoints)).toBe(true)
        expect(route.routePoints.length).toBeGreaterThan(1) // Should have more than just start/end points
        
        // Verify points are valid coordinates
        route.routePoints.forEach(point => {
          expect(Array.isArray(point)).toBe(true)
          expect(point).toHaveLength(2)
          expect(typeof point[0]).toBe('number')
          expect(typeof point[1]).toBe('number')
        })
      } else {
        console.log('❌ Test 5: Map component will NOT receive RoutePoints - will use straight line fallback')
        throw new Error('Map component should receive RoutePoints but they are missing')
      }
      
      console.log('✅ Test 5: Map component data verified')
    })
  })

  // Test 6: Route Update Scenarios (+ verify all previous)
  describe('Test 6: Route Update Scenarios', () => {
    it('should update trip metadata without losing RoutePoints', async () => {
      console.log('🔄 Test 6: Testing metadata update without losing RoutePoints...')
      
      // First, get current data
      const currentResponse = await apiCall(`/api/travel-data?id=${testTripId}`)
      const currentData = await currentResponse.json()
      
      // Update only the trip title
      const updatedData = {
        ...currentData,
        title: 'Updated Test Trip Title'
      }
      
      const response = await apiCall(`/api/travel-data?id=${testTripId}`, {
        method: 'PUT',
        body: JSON.stringify(updatedData)
      })
      
      const result = await response.json()
      expect(result.success).toBe(true)
      
      // Verify RoutePoints weren't lost
      const verifyResponse = await apiCall(`/api/travel-data?id=${testTripId}`)
      const verifyData = await verifyResponse.json()
      
      expect(verifyData.title).toBe('Updated Test Trip Title')
      expect(verifyData.routes).toHaveLength(1)
      
      const route = verifyData.routes[0]
      
      // 🔍 CRITICAL CHECK: RoutePoints should survive metadata updates
      if (route.routePoints) {
        console.log(`✅ Test 6: RoutePoints survived metadata update! Length: ${route.routePoints.length}`)
        expect(route.routePoints).toBeDefined()
        expect(Array.isArray(route.routePoints)).toBe(true)
        expect(route.routePoints.length).toBeGreaterThan(0)
      } else {
        console.log('❌ Test 6: RoutePoints LOST during metadata update!')
        throw new Error('RoutePoints should survive metadata updates but were lost')
      }
      
      console.log('✅ Test 6: Metadata update without RoutePoint loss verified')
    })

    it('should handle batch route updates correctly', async () => {
      console.log('🔄 Test 6: Testing batch route updates...')
      
      // Get current route
      const currentResponse = await apiCall(`/api/travel-data?id=${testTripId}`)
      const currentData = await currentResponse.json()
      const currentRoute = currentData.routes[0]
      
      // Test the batch route update endpoint
      const batchUpdate = {
        batchRouteUpdate: [{
          routeId: currentRoute.id,
          routePoints: [
            [51.5074, -0.1278], // London
            [50.0, -1.0],       // Intermediate point
            [48.8566, 2.3522]   // Paris
          ]
        }]
      }
      
      const response = await apiCall(`/api/travel-data?id=${testTripId}`, {
        method: 'PATCH',
        body: JSON.stringify(batchUpdate)
      })
      
      const result = await response.json()
      expect(result.success).toBe(true)
      
      // Verify the batch update worked
      const verifyResponse = await apiCall(`/api/travel-data?id=${testTripId}`)
      const verifyData = await verifyResponse.json()
      
      const route = verifyData.routes[0]
      expect(route.routePoints).toHaveLength(3)
      expect(route.routePoints[0]).toEqual([51.5074, -0.1278])
      expect(route.routePoints[2]).toEqual([48.8566, 2.3522])
      
      console.log('✅ Test 6: Batch route update verified')
    })
  })

  // Summary Test: Verify Complete Data Integrity
  describe('Final Verification: Complete Data Integrity', () => {
    it('should verify all test data remains intact', async () => {
      console.log('🔄 Final: Complete data integrity check...')
      
      const response = await apiCall(`/api/travel-data?id=${testTripId}`)
      const finalData = await response.json()
      
      // Verify trip
      expect(finalData.id).toBe(testTripId)
      expect(finalData.title).toBe('Updated Test Trip Title') // From Test 6
      
      // Verify locations
      expect(finalData.locations).toHaveLength(2)
      expect(finalData.locations[0].name).toBe(TEST_LOCATIONS[0].name)
      expect(finalData.locations[1].name).toBe(TEST_LOCATIONS[1].name)
      
      // Verify routes and RoutePoints
      expect(finalData.routes).toHaveLength(1)
      const route = finalData.routes[0]
      expect(route.from).toBe(TEST_ROUTE.from)
      expect(route.to).toBe(TEST_ROUTE.to)
      expect(route.routePoints).toBeDefined()
      expect(Array.isArray(route.routePoints)).toBe(true)
      expect(route.routePoints.length).toBeGreaterThan(0)
      
      console.log('✅ Final: Complete data integrity verified')
      console.log(`📊 Test Summary:`)
      console.log(`   - Trip ID: ${finalData.id}`)
      console.log(`   - Locations: ${finalData.locations.length}`)
      console.log(`   - Routes: ${finalData.routes.length}`)
      console.log(`   - RoutePoints: ${route.routePoints.length}`)
    })
  })
})
