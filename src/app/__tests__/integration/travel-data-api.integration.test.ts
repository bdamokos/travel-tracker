/**
 * API endpoint tests for travel-data routes
 * Tests the core CRUD operations for travel data management
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const BASE_URL = process.env.TEST_API_BASE_URL || 'http://localhost:3000';

// Test data that matches the real application structure
const TEST_TRAVEL_DATA = {
  title: 'API Test Trip',
  description: 'Test trip for API validation',
  startDate: '2024-07-01T00:00:00.000Z',
  endDate: '2024-07-15T00:00:00.000Z',
  locations: [
    {
      id: 'test-location-1',
      name: 'London',
      coordinates: [51.5074, -0.1278],
      date: '2024-07-01T00:00:00.000Z',
      notes: 'Starting point'
    },
    {
      id: 'test-location-2', 
      name: 'Paris',
      coordinates: [48.8566, 2.3522],
      date: '2024-07-10T00:00:00.000Z',
      notes: 'Second city'
    }
  ],
  routes: [
    {
      id: 'test-route-1',
      from: 'London',
      to: 'Paris',
      fromCoords: [51.5074, -0.1278],
      toCoords: [48.8566, 2.3522],
      transportType: 'train',
      date: new Date('2024-07-05T00:00:00.000Z'),
      duration: '3h 30min',
      notes: 'Eurostar connection'
    }
  ]
};

describe('Travel Data API Endpoints', () => {
  let createdTripId: string;

  const apiCall = async (endpoint: string, options: RequestInit = {}) => {
    const url = `${BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    return response;
  };

  describe('POST /api/travel-data (Create Trip)', () => {
    it('should create a new trip with valid data', async () => {
      const response = await apiCall('/api/travel-data', {
        method: 'POST',
        body: JSON.stringify(TEST_TRAVEL_DATA)
      });

      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
      
      // Store for cleanup and further tests
      createdTripId = result.id;
    });

    it('should handle trip creation with minimal data', async () => {
      const minimalData = {
        title: 'Minimal Trip'
        // Testing what the API actually accepts
      };

      const response = await apiCall('/api/travel-data', {
        method: 'POST',
        body: JSON.stringify(minimalData)
      });

      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      
      // Clean up this test trip
      await apiCall(`/api/travel-data?id=${result.id}`, {
        method: 'DELETE'
      });
    });
  });

  describe('GET /api/travel-data (Read Trip)', () => {
    it('should retrieve a trip by ID', async () => {
      if (!createdTripId) {
        throw new Error('No trip created to test retrieval');
      }

      const response = await apiCall(`/api/travel-data?id=${createdTripId}`);
      const tripData = await response.json();

      expect(tripData.id).toBe(createdTripId);
      expect(tripData.title).toBe(TEST_TRAVEL_DATA.title);
      expect(tripData.description).toBe(TEST_TRAVEL_DATA.description);
      expect(tripData.locations).toHaveLength(2);
      expect(tripData.routes).toHaveLength(1);
    });

    it('should return 404 for non-existent trip', async () => {
      await expect(
        apiCall('/api/travel-data?id=non-existent-trip')
      ).rejects.toThrow(/404/);
    });
  });

  describe('PUT /api/travel-data (Update Trip)', () => {
    it('should update trip data correctly', async () => {
      if (!createdTripId) {
        throw new Error('No trip created to test update');
      }

      const updatedData = {
        ...TEST_TRAVEL_DATA,
        id: createdTripId,
        title: 'Updated API Test Trip',
        description: 'Updated description',
        locations: [
          ...TEST_TRAVEL_DATA.locations,
          {
            id: 'test-location-3',
            name: 'Amsterdam',
            coordinates: [52.3676, 4.9041],
            date: '2024-07-12T00:00:00.000Z',
            notes: 'Third city added'
          }
        ]
      };

      const response = await apiCall(`/api/travel-data?id=${createdTripId}`, {
        method: 'PUT',
        body: JSON.stringify(updatedData)
      });

      const result = await response.json();
      expect(result.success).toBe(true);

      // Verify the update
      const getResponse = await apiCall(`/api/travel-data?id=${createdTripId}`);
      const updatedTrip = await getResponse.json();
      
      expect(updatedTrip.title).toBe('Updated API Test Trip');
      expect(updatedTrip.description).toBe('Updated description');
      expect(updatedTrip.locations).toHaveLength(3);
      expect(updatedTrip.locations[2].name).toBe('Amsterdam');
    });
  });

  describe('PATCH /api/travel-data (Batch Updates)', () => {
    it('should handle batch route updates', async () => {
      if (!createdTripId) {
        throw new Error('No trip created to test batch update');
      }

      const batchUpdate = {
        batchRouteUpdate: [{
          routeId: 'test-route-1',
          routePoints: [
            [51.5074, -0.1278], // London
            [50.0, -1.0],       // Intermediate point
            [48.8566, 2.3522]   // Paris
          ]
        }]
      };

      const response = await apiCall(`/api/travel-data?id=${createdTripId}`, {
        method: 'PATCH',
        body: JSON.stringify(batchUpdate)
      });

      const result = await response.json();
      expect(result.success).toBe(true);

      // Verify the route points were added
      const getResponse = await apiCall(`/api/travel-data?id=${createdTripId}`);
      const updatedTrip = await getResponse.json();
      
      expect(updatedTrip.routes[0].routePoints).toHaveLength(3);
      expect(updatedTrip.routes[0].routePoints[0]).toEqual([51.5074, -0.1278]);
    });
  });

  describe('GET /api/travel-data/list (List All Trips)', () => {
    it('should list all trips', async () => {
      const response = await apiCall('/api/travel-data/list');
      const trips = await response.json();

      expect(Array.isArray(trips)).toBe(true);
      expect(trips.length).toBeGreaterThan(0);
      
      // Should include our created trip
      const ourTrip = trips.find(trip => trip.id === createdTripId);
      expect(ourTrip).toBeDefined();
      expect(ourTrip.title).toBe('Updated API Test Trip');
    });
  });

  describe('DELETE /api/travel-data (Delete Trip)', () => {
    it('should delete a trip', async () => {
      if (!createdTripId) {
        throw new Error('No trip created to test deletion');
      }

      const response = await apiCall(`/api/travel-data?id=${createdTripId}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      expect(result.success).toBe(true);

      // Verify deletion - should return 404
      await expect(
        apiCall(`/api/travel-data?id=${createdTripId}`)
      ).rejects.toThrow(/404/);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      await expect(
        fetch(`${BASE_URL}/api/travel-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'invalid json'
        })
      ).resolves.toHaveProperty('ok', false);
    });

    it('should validate required parameters', async () => {
      // Missing ID parameter for GET
      await expect(
        apiCall('/api/travel-data')
      ).rejects.toThrow();
    });
  });
});