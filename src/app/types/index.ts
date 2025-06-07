// Location type for storing geographical coordinates and related information
export type Location = {
  id: string;
  name: string;
  coordinates: [number, number]; // [latitude, longitude]
  arrivalTime?: string;
  notes?: string;
};

// Transportation type for route segments
export interface Transportation {
  id: string;
  type: 'walk' | 'bike' | 'car' | 'bus' | 'train' | 'plane' | 'ferry' | 'other';
  from: string;
  to: string;
  departureTime?: string;
  arrivalTime?: string;
  distance?: number; // Distance in kilometers
  fromCoordinates?: [number, number]; // [latitude, longitude]
  toCoordinates?: [number, number]; // [latitude, longitude]
}

// Instagram post reference
export type InstagramPost = {
  id: string;
  url: string;
  offline: boolean;
};

// Single travel period (could be a day, part of a day, or multiple days)
export type JourneyPeriod = {
  id: string;
  date: string;        // Primary date for the period
  endDate?: string;    // Optional end date if period spans multiple days
  title: string;
  locations: Location[];
  transportation?: Transportation;
  instagramPosts?: InstagramPost[];
  customNotes?: string;
  editStatus: 'synced' | 'draft' | 'modified';
};

// For backward compatibility
export type JourneyDay = JourneyPeriod;

// Complete journey data structure
export type Journey = {
  id: string;
  title: string;
  startDate: string;
  endDate?: string;
  lastSynced?: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  days: JourneyPeriod[];  // Still called "days" for API compatibility, but contains periods
};

// Offline storage schema
export type OfflineStorage = {
  journeys: {
    current: string;
    list: string[];
  };
  pendingUploads: PendingUpload[];
  cachedMapTiles?: CachedMapTile[];
};

export type PendingUpload = {
  id: string;
  type: 'newPeriod' | 'modifyPeriod' | 'modifyLocation' | 'deletePeriod' | 'deleteLocation';
  journeyId: string;
  periodId?: string;
  locationId?: string;
  data: any;
  timestamp: string;
};

export type CachedMapTile = {
  id: string;
  z: number;
  x: number;
  y: number;
  data: string;
  expires: string;
}; 