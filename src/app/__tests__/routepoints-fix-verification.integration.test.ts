/**
 * RoutePoints Fix Verification Test
 * 
 * This test verifies that the RouteInlineEditor fix preserves routePoints
 * when routes are edited through the inline editor component.
 */

import { describe, it, expect } from '@jest/globals'
import { generateRoutePoints } from '../lib/routeUtils'
import { Transportation } from '../types'

const BASE_URL = process.env.TEST_API_BASE_URL || 'http://localhost:3000'

describe('RoutePoints Fix Verification', () => {
  it('should preserve routePoints when routes are edited through RouteInlineEditor flow', async () => {
    console.log('🔄 Testing RouteInlineEditor fix...')
    
    // 1. Create a test trip
    const createResponse = await fetch(`${BASE_URL}/api/travel-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'RoutePoints Fix Test',
        description: 'Testing the RouteInlineEditor fix',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        locations: [],
        routes: []
      })
    })
    
    const createResult = await createResponse.json()
    const testTripId = createResult.id
    console.log(`✅ Test trip created with ID: ${testTripId}`)

    // 2. Generate route points
    const transportation: Transportation = {
      id: 'test-route-fix',
      type: 'car',
      from: 'Amsterdam',
      to: 'Brussels',
      fromCoordinates: [52.3676, 4.9041],
      toCoordinates: [50.8476, 4.3572]
    }
    
    const routePoints = await generateRoutePoints(transportation)
    console.log(`✅ Generated ${routePoints.length} route points`)

    // 3. Create initial trip data with route and routePoints
    const initialData = {
      id: testTripId,
      title: 'RoutePoints Fix Test',
      description: 'Testing the RouteInlineEditor fix',
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      locations: [
        {
          id: 'loc-amsterdam',
          name: 'Amsterdam',
          coordinates: [52.3676, 4.9041],
          date: new Date().toISOString(),
          notes: '',
          instagramPosts: [],
          blogPosts: [],
          accommodationData: '',
          isAccommodationPublic: false,
          costTrackingLinks: []
        },
        {
          id: 'loc-brussels',
          name: 'Brussels',
          coordinates: [50.8476, 4.3572],
          date: new Date().toISOString(),
          notes: '',
          instagramPosts: [],
          blogPosts: [],
          accommodationData: '',
          isAccommodationPublic: false,
          costTrackingLinks: []
        }
      ],
      routes: [{
        id: 'test-route-fix',
        from: 'Amsterdam',
        to: 'Brussels',
        fromCoords: [52.3676, 4.9041],
        toCoords: [50.8476, 4.3572],
        transportType: 'car',
        date: new Date(),
        duration: '2h 30min',
        notes: 'Initial route',
        privateNotes: '',
        costTrackingLinks: [],
        routePoints: routePoints
      }]
    }

    const initialSaveResponse = await fetch(`${BASE_URL}/api/travel-data?id=${testTripId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(initialData)
    })
    
    expect(initialSaveResponse.ok).toBe(true)
    console.log('✅ Initial data with routePoints saved')

    // 4. Verify initial routePoints are saved
    const verifyInitialResponse = await fetch(`${BASE_URL}/api/travel-data?id=${testTripId}`)
    const initialVerifyData = await verifyInitialResponse.json()
    
    console.log(`📦 Initial verification: ${initialVerifyData.routes[0].routePoints?.length || 0} route points`)
    expect(initialVerifyData.routes[0].routePoints?.length).toBe(routePoints.length)

    // 5. Simulate what happens when RouteInlineEditor updates a route
    // (this simulates the fix - the updated route should preserve routePoints)
    const currentData = await (await fetch(`${BASE_URL}/api/travel-data?id=${testTripId}`)).json()
    
    // Simulate RouteInlineEditor updating the route with a new note but preserving routePoints
    const updatedRoute = {
      ...currentData.routes[0],
      notes: 'Updated via RouteInlineEditor - routePoints should be preserved',
      // The fix ensures routePoints are preserved when using centralized TravelRoute type
    }

    const updatedData = {
      ...currentData,
      routes: [updatedRoute]
    }

    console.log(`📦 Updated route before save: routePoints length = ${updatedRoute.routePoints?.length || 0}`)

    const updateResponse = await fetch(`${BASE_URL}/api/travel-data?id=${testTripId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData)
    })
    
    expect(updateResponse.ok).toBe(true)
    console.log('✅ Route updated via simulated RouteInlineEditor')

    // 6. Verify that routePoints are preserved after the update
    const finalVerifyResponse = await fetch(`${BASE_URL}/api/travel-data?id=${testTripId}`)
    const finalData = await finalVerifyResponse.json()
    
    console.log(`📦 Final verification: ${finalData.routes[0].routePoints?.length || 0} route points`)
    console.log(`📝 Route notes updated to: "${finalData.routes[0].notes}"`)

    if (finalData.routes[0].routePoints && finalData.routes[0].routePoints.length === routePoints.length) {
      console.log('✅ SUCCESS: RoutePoints preserved after RouteInlineEditor update!')
    } else {
      console.log('❌ FAILURE: RoutePoints lost after RouteInlineEditor update!')
    }

    // Cleanup
    await fetch(`${BASE_URL}/api/travel-data?id=${testTripId}`, {
      method: 'DELETE'
    })

    expect(finalData.routes[0].routePoints).toBeDefined()
    expect(finalData.routes[0].routePoints.length).toBe(routePoints.length)
    expect(finalData.routes[0].notes).toBe('Updated via RouteInlineEditor - routePoints should be preserved')
  })
})