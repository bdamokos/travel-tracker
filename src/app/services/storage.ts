import { openDB, DBSchema } from 'idb';
import { Journey, JourneyDay, OfflineStorage, PendingUpload, CachedMapTile } from '../types';

interface TravelTrackerDB extends DBSchema {
  journeys: {
    key: string;
    value: Journey;
  };
  offlineStorage: {
    key: 'offlineStorage';
    value: OfflineStorage;
  };
  pendingUploads: {
    key: string;
    value: PendingUpload;
    indexes: { 'by-timestamp': string };
  };
  cachedMapTiles: {
    key: string;
    value: CachedMapTile;
    indexes: { 'by-coordinates': [number, number, number] };
  };
}

const DB_NAME = 'travel-tracker-db';
const DB_VERSION = 1;

// Initialize the database
export const initDB = async () => {
  return openDB<TravelTrackerDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create stores if they don't exist
      if (!db.objectStoreNames.contains('journeys')) {
        db.createObjectStore('journeys', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('offlineStorage')) {
        db.createObjectStore('offlineStorage');
      }
      
      if (!db.objectStoreNames.contains('pendingUploads')) {
        const pendingUploadsStore = db.createObjectStore('pendingUploads', { keyPath: 'id' });
        pendingUploadsStore.createIndex('by-timestamp', 'timestamp');
      }
      
      if (!db.objectStoreNames.contains('cachedMapTiles')) {
        const tilesStore = db.createObjectStore('cachedMapTiles', { 
          keyPath: 'id' 
        });
        tilesStore.createIndex('by-coordinates', ['z', 'x', 'y']);
      }
      
      // Initialize offline storage with default values
      const offlineStore = db.transaction('offlineStorage', 'readwrite').objectStore('offlineStorage');
      offlineStore.put({
        journeys: {
          current: '',
          list: []
        },
        pendingUploads: []
      }, 'offlineStorage');
    }
  });
};

// Get all journeys
export const getAllJourneys = async () => {
  const db = await initDB();
  return db.getAll('journeys');
};

// Get a specific journey
export const getJourney = async (id: string) => {
  const db = await initDB();
  return db.get('journeys', id);
};

// Save a journey
export const saveJourney = async (journey: Journey) => {
  const db = await initDB();
  await db.put('journeys', journey);
  
  // Update the journeys list in offline storage
  const offlineStorage = await db.get('offlineStorage', 'offlineStorage') as OfflineStorage;
  if (!offlineStorage.journeys.list.includes(journey.id)) {
    offlineStorage.journeys.list.push(journey.id);
    await db.put('offlineStorage', offlineStorage, 'offlineStorage');
  }
  
  return journey;
};

// Delete a journey
export const deleteJourney = async (id: string) => {
  const db = await initDB();
  await db.delete('journeys', id);
  
  // Update the journeys list in offline storage
  const offlineStorage = await db.get('offlineStorage', 'offlineStorage') as OfflineStorage;
  offlineStorage.journeys.list = offlineStorage.journeys.list.filter(journeyId => journeyId !== id);
  if (offlineStorage.journeys.current === id) {
    offlineStorage.journeys.current = offlineStorage.journeys.list[0] || '';
  }
  await db.put('offlineStorage', offlineStorage, 'offlineStorage');
};

// Add a day to a journey
export const addDayToJourney = async (journeyId: string, day: JourneyDay) => {
  const db = await initDB();
  const journey = await db.get('journeys', journeyId);
  if (!journey) {
    throw new Error(`Journey with ID ${journeyId} not found`);
  }
  
  journey.days.push(day);
  journey.days.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  await db.put('journeys', journey);
  
  // Add to pending uploads if offline
  if (!navigator.onLine) {
    const pendingUpload: PendingUpload = {
      id: `upload-${Date.now()}`,
      type: 'newDay',
      journeyId,
      data: day,
      timestamp: new Date().toISOString()
    };
    await db.add('pendingUploads', pendingUpload);
  }
  
  return journey;
};

// Update a day in a journey
export const updateDay = async (journeyId: string, dayId: string, updatedDay: Partial<JourneyDay>) => {
  const db = await initDB();
  const journey = await db.get('journeys', journeyId);
  if (!journey) {
    throw new Error(`Journey with ID ${journeyId} not found`);
  }
  
  const dayIndex = journey.days.findIndex(day => day.id === dayId);
  if (dayIndex === -1) {
    throw new Error(`Day with ID ${dayId} not found in journey ${journeyId}`);
  }
  
  journey.days[dayIndex] = { ...journey.days[dayIndex], ...updatedDay };
  await db.put('journeys', journey);
  
  // Add to pending uploads if offline
  if (!navigator.onLine) {
    const pendingUpload: PendingUpload = {
      id: `upload-${Date.now()}`,
      type: 'modifyDay',
      journeyId,
      dayId,
      data: updatedDay,
      timestamp: new Date().toISOString()
    };
    await db.add('pendingUploads', pendingUpload);
  }
  
  return journey;
};

// Get all pending uploads
export const getPendingUploads = async () => {
  const db = await initDB();
  return db.getAllFromIndex('pendingUploads', 'by-timestamp');
};

// Process pending uploads (to be called when online)
export const processPendingUploads = async () => {
  const db = await initDB();
  const pendingUploads = await getPendingUploads();
  
  // TODO: Implement server sync logic here
  
  // For now, just clear the pending uploads
  const tx = db.transaction('pendingUploads', 'readwrite');
  for (const upload of pendingUploads) {
    await tx.store.delete(upload.id);
  }
  await tx.done;
  
  return pendingUploads.length;
};

// Cache a map tile
export const cacheMapTile = async (z: number, x: number, y: number, data: string) => {
  const db = await initDB();
  const id = `tile-${z}-${x}-${y}`;
  const expiresDate = new Date();
  expiresDate.setDate(expiresDate.getDate() + 30); // Cache for 30 days
  
  const tile: CachedMapTile = {
    id,
    z,
    x,
    y,
    data,
    expires: expiresDate.toISOString()
  };
  
  await db.put('cachedMapTiles', tile);
};

// Get a cached map tile
export const getCachedMapTile = async (z: number, x: number, y: number) => {
  const db = await initDB();
  const tiles = await db.getAllFromIndex('cachedMapTiles', 'by-coordinates', [z, x, y]);
  if (tiles.length === 0) {
    return null;
  }
  
  const tile = tiles[0];
  const now = new Date();
  const expires = new Date(tile.expires);
  
  if (now > expires) {
    // Tile is expired, delete it
    await db.delete('cachedMapTiles', tile.id);
    return null;
  }
  
  return tile;
}; 