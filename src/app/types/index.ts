// Location type for storing geographical coordinates and related information
export type Location = {
  id: string;
  name: string;
  coordinates: [number, number]; // [latitude, longitude]
  arrivalTime?: string;
  notes?: string;
};

// Transportation type for route segments
export type Transportation = {
  id: string;
  type: 'walk' | 'bus' | 'train' | 'plane' | 'car' | 'ferry' | 'bike' | 'other';
  from: string;
  to: string;
  fromCoordinates: [number, number];
  toCoordinates: [number, number];
  distance?: number;
  departureTime?: string;
  arrivalTime?: string;
};

// Instagram post reference
export type InstagramPost = {
  id: string;
  url: string;
  offline: boolean;
};

// Single day of a journey
export type JourneyDay = {
  id: string;
  date: string;
  title: string;
  locations: Location[];
  transportation?: Transportation;
  instagramPosts?: InstagramPost[];
  customNotes?: string;
  editStatus: 'synced' | 'draft' | 'modified';
};

// Complete journey data structure
export type Journey = {
  id: string;
  title: string;
  startDate: string;
  endDate?: string;
  lastSynced?: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  days: JourneyDay[];
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
  type: 'newDay' | 'modifyDay' | 'modifyLocation' | 'deleteDay' | 'deleteLocation';
  journeyId: string;
  dayId?: string;
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