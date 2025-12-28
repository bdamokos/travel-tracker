/**
 * Debug Frontend Flow Test
 * 
 * This test specifically triggers the frontend handleRouteAdded -> auto-save flow
 * to identify where RoutePoints are lost in the React state management.
 * 
 * This is a debugging harness and is skipped by default in CI. Run with
 * RUN_DEBUG_TESTS=true and a dev server available at TEST_API_BASE_URL.
 */

import { describe, it, expect } from '@jest/globals'
import { generateRoutePoints } from '../../lib/routeUtils'
import { Transportation } from '../../types'

const BASE_URL = process.env.TEST_API_BASE_URL || 'http://localhost:3000'
const RUN_DEBUG_TESTS = process.env.RUN_DEBUG_TESTS === 'true'
const describeDebug = RUN_DEBUG_TESTS ? describe : describe.skip

if (!RUN_DEBUG_TESTS) {
  console.warn(
    'Skipping Debug Frontend Flow integration test. Set RUN_DEBUG_TESTS=true and ensure a Next.js server is running at TEST_API_BASE_URL to execute this debugging harness.'
  )
}

describeDebug('Debug Frontend Flow', () => {
  let testTripId: string

  it('should create a trip and trigger frontend route addition flow', async () => {
    console.log('🔄 Creating test trip...')
    
    // 1. Create a test trip (POST generates its own ID)
    const createResponse = await fetch(`${BASE_URL}/api/travel-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Debug Frontend Flow Test',
        description: 'Testing frontend route addition',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        locations: [],
        routes: []
      })
    })
    
    expect(createResponse.ok).toBe(true)
    const createResult = await createResponse.json()
    testTripId = createResult.id
    console.log(`✅ Test trip created with ID: ${testTripId}`)

    // 2. Test direct route generation (should work)
    console.log('🔄 Testing direct route generation...')
    const transportation: Transportation = {
      id: 'test-route-1',
      type: 'train',
      from: 'London',
      to: 'Paris',
      fromCoordinates: [51.5074, -0.1278],
      toCoordinates: [48.8566, 2.3522]
    }
    
    const routePoints = await generateRoutePoints(transportation)
    console.log(`✅ Direct route generation: ${routePoints.length} points`)
    expect(routePoints.length).toBeGreaterThan(2)

    // 3. Simulate what happens in handleRouteAdded
    console.log('🔄 Simulating handleRouteAdded flow...')
    
    // This simulates the route object after handleRouteAdded processes it
    const routeWithPoints = {
      id: 'test-route-1',
      from: 'London',
      to: 'Paris',
      fromCoords: [51.5074, -0.1278],
      toCoords: [48.8566, 2.3522],
      transportType: 'train',
      date: new Date(),
      duration: '2h 30min',
      notes: 'Test route',
      privateNotes: '',
      costTrackingLinks: [],
      routePoints: routePoints // This should be preserved
    }
    
    console.log(`📦 Route object before save: routePoints.length = ${routeWithPoints.routePoints?.length}`)

    // 4. Simulate what autoSaveTravelData does
    console.log('🔄 Simulating autoSaveTravelData flow...')
    
    const travelData = {
      id: testTripId,
      title: 'Debug Frontend Flow Test',
      description: 'Testing frontend route addition',
      startDate: new Date(),
      endDate: new Date(),
      locations: [
        {
          id: 'loc-1',
          name: 'London',
          coordinates: [51.5074, -0.1278],
          date: new Date(),
          notes: '',
          instagramPosts: [],
          blogPosts: [],
          accommodationData: '',
          isAccommodationPublic: false,
          costTrackingLinks: []
        },
        {
          id: 'loc-2',
          name: 'Paris',
          coordinates: [48.8566, 2.3522],
          date: new Date(),
          notes: '',
          instagramPosts: [],
          blogPosts: [],
          accommodationData: '',
          isAccommodationPublic: false,
          costTrackingLinks: []
        }
      ],
      routes: [routeWithPoints]
    }
    
    console.log(`📦 TravelData before API call: routes[0].routePoints.length = ${travelData.routes[0].routePoints?.length}`)

    // 5. Make the API call (this is where we suspect the loss happens)
    const saveResponse = await fetch(`${BASE_URL}/api/travel-data?id=${testTripId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(travelData)
    })
    
    expect(saveResponse.ok).toBe(true)
    console.log('✅ Data saved via API')

    // 6. Verify what was actually saved
    console.log('🔄 Verifying saved data...')
    
    const verifyResponse = await fetch(`${BASE_URL}/api/travel-data?id=${testTripId}`)
    expect(verifyResponse.ok).toBe(true)
    
    const savedData = await verifyResponse.json()
    console.log(`📦 Retrieved data: routes[0].routePoints.length = ${savedData.routes[0].routePoints?.length}`)
    
    if (savedData.routes[0].routePoints && savedData.routes[0].routePoints.length > 0) {
      console.log('✅ SUCCESS: RoutePoints preserved through frontend flow!')
    } else {
      console.log('❌ FAILURE: RoutePoints lost in frontend flow!')
      console.log('📊 Debugging info:')
      console.log('  - Generated points:', routePoints.length)
      console.log('  - Route object had points:', routeWithPoints.routePoints?.length)
      console.log('  - TravelData had points:', travelData.routes[0].routePoints?.length)
      console.log('  - Saved data has points:', savedData.routes[0].routePoints?.length || 0)
    }

    // Cleanup
    await fetch(`${BASE_URL}/api/travel-data?id=${testTripId}`, {
      method: 'DELETE'
    })
  })
})
