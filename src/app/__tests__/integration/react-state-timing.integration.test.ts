/**
 * React State Timing Test
 * 
 * This test simulates the React state timing issue that might be causing
 * RoutePoints to be lost during auto-save.
 */

import { describe, it, expect } from '@jest/globals'
import { generateRoutePoints } from '@/app/lib/routeUtils'
import { Transportation } from '@/app/types'

const BASE_URL = (() => {
  const fromEnv = process.env.TEST_API_BASE_URL
  if (!fromEnv) {
    throw new Error('TEST_API_BASE_URL must be set for integration API tests')
  }
  return fromEnv
})()

describe('React State Timing Test', () => {
  it('should test if rapid state updates and auto-save cause data loss', async () => {
    console.log('🔄 Testing React state timing scenario...')
    
    // 1. Create a test trip
    const createResponse = await fetch(`${BASE_URL}/api/travel-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'React State Timing Test',
        description: 'Testing React state update timing',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        locations: [],
        routes: []
      })
    })
    
    const createResult = await createResponse.json()
    const testTripId = createResult.id
    console.log(`✅ Test trip created with ID: ${testTripId}`)

    // 2. Generate route points (simulating handleRouteAdded)
    const transportation: Transportation = {
      id: 'react-test-route',
      type: 'train',
      from: 'Berlin',
      to: 'Munich',
      fromCoordinates: [52.5200, 13.4050],
      toCoordinates: [48.1351, 11.5820]
    }
    
    const routePoints = await generateRoutePoints(transportation)
    console.log(`✅ Generated ${routePoints.length} route points`)

    // 3. Simulate the scenario where React state is updated rapidly
    // First, load current trip data (simulating existing state)
    const currentResponse = await fetch(`${BASE_URL}/api/travel-data?id=${testTripId}`)
    const currentData = await currentResponse.json()
    
    // 4. Simulate adding locations first (as handleRouteAdded does)
    const locationsUpdate = {
      ...currentData,
      locations: [
        {
          id: 'loc-berlin',
          name: 'Berlin',
          coordinates: [52.5200, 13.4050],
          date: new Date().toISOString(),
          notes: '',
          instagramPosts: [],
          blogPosts: [],
          accommodationData: '',
          isAccommodationPublic: false,
          costTrackingLinks: []
        },
        {
          id: 'loc-munich',
          name: 'Munich',
          coordinates: [48.1351, 11.5820],
          date: new Date().toISOString(),
          notes: '',
          instagramPosts: [],
          blogPosts: [],
          accommodationData: '',
          isAccommodationPublic: false,
          costTrackingLinks: []
        }
      ]
    }

    // 5. Simulate adding the route WITH routePoints (as handleRouteAdded does)
    const routeWithPoints = {
      id: 'react-test-route',
      from: 'Berlin',
      to: 'Munich',
      fromCoords: [52.5200, 13.4050],
      toCoords: [48.1351, 11.5820],
      transportType: 'train',
      date: new Date(),
      duration: '4h',
      notes: 'Test route',
      privateNotes: '',
      costTrackingLinks: [],
      routePoints: routePoints
    }

    const fullUpdate = {
      ...locationsUpdate,
      routes: [routeWithPoints]
    }

    console.log(`📦 Full update has ${fullUpdate.routes[0].routePoints.length} route points`)

    // 6. Save the complete update (simulating what auto-save does)
    const saveResponse = await fetch(`${BASE_URL}/api/travel-data?id=${testTripId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullUpdate)
    })
    
    expect(saveResponse.ok).toBe(true)
    console.log('✅ Full update saved via API')

    // 7. Immediately check what was saved (simulating race condition)
    const immediateVerifyResponse = await fetch(`${BASE_URL}/api/travel-data?id=${testTripId}`)
    const immediateData = await immediateVerifyResponse.json()
    
    console.log(`📦 Immediate verification: ${immediateData.routes[0].routePoints?.length || 0} route points`)

    // 8. Wait a bit and check again (to rule out async issues)
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const delayedVerifyResponse = await fetch(`${BASE_URL}/api/travel-data?id=${testTripId}`)
    const delayedData = await delayedVerifyResponse.json()
    
    console.log(`📦 Delayed verification: ${delayedData.routes[0].routePoints?.length || 0} route points`)

    // 9. Test multiple rapid updates (simulating React state churn)
    console.log('🔄 Testing rapid updates...')
    
    for (let i = 0; i < 3; i++) {
      const rapidUpdate = {
        ...fullUpdate,
        title: `React State Timing Test - Update ${i + 1}`
      }
      
      await fetch(`${BASE_URL}/api/travel-data?id=${testTripId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rapidUpdate)
      })
      
      console.log(`📦 Rapid update ${i + 1} sent`)
    }

    // 10. Final verification
    const finalVerifyResponse = await fetch(`${BASE_URL}/api/travel-data?id=${testTripId}`)
    const finalData = await finalVerifyResponse.json()
    
    console.log(`📦 Final verification: ${finalData.routes[0].routePoints?.length || 0} route points`)

    if (finalData.routes[0].routePoints && finalData.routes[0].routePoints.length > 0) {
      console.log('✅ SUCCESS: RoutePoints survived rapid React-style updates!')
    } else {
      console.log('❌ FAILURE: RoutePoints lost during rapid updates!')
    }

    // Cleanup
    await fetch(`${BASE_URL}/api/travel-data?id=${testTripId}`, {
      method: 'DELETE'
    })

    expect(finalData.routes[0].routePoints).toBeDefined()
    expect(finalData.routes[0].routePoints.length).toBeGreaterThan(0)
  }, 10000) // 10 second timeout
})
