// Geocoding service for Travel Tracker
// Provides location search, reverse geocoding, and route calculations

import { Transportation } from '../types';

/**
 * Convert a location name to coordinates using OpenStreetMap Nominatim
 * @param locationName The name of the location to search for
 * @returns [lat, lng] coordinates array or null if not found
 */
export async function geocodeLocation(locationName: string): Promise<[number, number] | null> {
  try {
    // Add a delay to respect Nominatim usage policy (max 1 request per second)
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json&limit=1`,
      {
        headers: {
          'User-Agent': 'TravelTracker/1.0'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch location data');
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    }
    
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Get location name from coordinates using reverse geocoding
 * @param latitude Latitude coordinate
 * @param longitude Longitude coordinate
 * @returns Location name or null if not found
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  try {
    // Add a delay to respect Nominatim usage policy (max 1 request per second)
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
      {
        headers: {
          'User-Agent': 'TravelTracker/1.0'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch location name');
    }
    
    const data = await response.json();
    
    if (data && data.display_name) {
      return data.display_name;
    }
    
    return null;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

/**
 * Calculate the great circle distance between two points using the Haversine formula
 * @param fromCoords [lat, lng] coordinates of the starting point
 * @param toCoords [lat, lng] coordinates of the ending point
 * @returns Distance in kilometers
 */
export function calculateDistance(
  fromCoords: [number, number], 
  toCoords: [number, number]
): number {
  const [lat1, lon1] = fromCoords;
  const [lat2, lon2] = toCoords;
  
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

/**
 * Estimate travel time based on the distance and transportation type
 * @param distance Distance in kilometers
 * @param transportType Transportation type (walk, bike, car, bus, train, plane, ferry, other)
 * @returns Estimated travel time in minutes
 */
export function estimateTravelTime(
  distance: number, 
  transportType: Transportation['type']
): number {
  // Define average speeds for different transportation types (km/h)
  const speeds: Record<string, number> = {
    walk: 5,
    bike: 15,
    car: 80,
    bus: 60,
    train: 100,
    metro: 35,  // Metro/subway average speed
    plane: 800,
    ferry: 40,
    boat: 30,   // General boat speed
    other: 50
  };
  
  // Convert distance to time in hours, then to minutes
  const timeInHours = distance / speeds[transportType];
  const timeInMinutes = Math.ceil(timeInHours * 60);
  
  // Add additional time based on transportation type
  // (airport security/boarding for planes, waiting times for public transport, etc.)
  let additionalTime = 0;
  
  switch (transportType) {
    case 'plane':
      additionalTime = 120; // 2 hours for airport security, boarding, etc.
      break;
    case 'train':
    case 'bus':
      additionalTime = 20; // 20 min for waiting, boarding
      break;
    case 'ferry':
      additionalTime = 30; // 30 min for boarding, docking
      break;
  }
  
  return timeInMinutes + additionalTime;
}

/**
 * Format travel time in a human-readable format
 * @param minutes Travel time in minutes
 * @returns Formatted travel time string (e.g. "2h 30min")
 */
export function formatTravelTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  
  return `${hours}h ${remainingMinutes}min`;
}

/**
 * Get a simplified path between two points
 * For now, this returns a direct line. Future versions could call a routing API.
 * @param fromCoords [lat, lng] coordinates of the starting point
 * @param toCoords [lat, lng] coordinates of the ending point
 * @returns Array of [lat, lng] coordinates representing the path
 */
export function getRoutePath(
  fromCoords: [number, number], 
  toCoords: [number, number]
): [number, number][] {
  // For now, just return a direct line between the two points
  // In the future, this could call a routing API for actual routes
  return [fromCoords, toCoords];
}

/**
 * Estimate CO2 emissions for a journey
 * @param distance Distance in kilometers
 * @param transportType Transportation type
 * @returns CO2 emissions in kg
 */
export function calculateCO2Emissions(
  distance: number,
  transportType: 'walk' | 'bike' | 'car' | 'bus' | 'train' | 'plane' | 'ferry' | 'other'
): number {
  // CO2 emissions in kg per passenger-kilometer
  const emissionsFactors: Record<string, number> = {
    walk: 0,
    bike: 0,
    car: 0.12, // Average car
    bus: 0.05,
    train: 0.04,
    plane: 0.25,
    ferry: 0.19,
    other: 0.10
  };
  
  return Math.round(distance * emissionsFactors[transportType] * 10) / 10;
} 