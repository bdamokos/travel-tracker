import { openDB, DBSchema } from 'idb';
import { Journey, JourneyDay, JourneyPeriod, OfflineStorage, PendingUpload, CachedMapTile } from '../types';
import type { IDBPDatabase } from 'idb';

// Database setup
const DB_NAME = 'travel-tracker';
const DB_VERSION = 2;

// Database connection reference
let db: IDBPDatabase<TravelTrackerDB> | null = null;
let initPromise: Promise<IDBPDatabase<TravelTrackerDB>> | null = null;

// Database type definition
interface TravelTrackerDB extends DBSchema {
  journeys: {
    key: string;
    value: Journey;
  };
  offlineStorage: {
    key: string;
    value: OfflineStorage;
  };
  pendingUploads: {
    key: string;
    value: PendingUpload;
    indexes: { 'by-timestamp': string };
  };
  mapTiles: {
    key: string;
    value: CachedMapTile;
    indexes: { 'by-coordinates': [number, number, number] };
  };
}

/**
 * Initialize and open the IndexedDB database
 */
export const initDB = async (): Promise<IDBPDatabase<TravelTrackerDB>> => {
  // If database is already initialized, return it
  if (db) {
    return db;
  }
  
  // If initialization is in progress, wait for it
  if (initPromise) {
    return initPromise;
  }
  
  // Start initialization
  initPromise = new Promise(async (resolve, reject) => {
    try {
      console.log('Initializing database...');
      
      const database = await openDB<TravelTrackerDB>(DB_NAME, DB_VERSION, {
        upgrade(database, oldVersion, newVersion, transaction) {
          console.log(`Upgrading database from version ${oldVersion} to ${newVersion}`);
          
          // Create object stores if they don't exist
          if (!database.objectStoreNames.contains('journeys')) {
            console.log('Creating journeys object store');
            database.createObjectStore('journeys', { keyPath: 'id' });
          }
          
          if (!database.objectStoreNames.contains('offlineStorage')) {
            console.log('Creating offlineStorage object store');
            database.createObjectStore('offlineStorage', { keyPath: 'id' });
          }
          
          if (!database.objectStoreNames.contains('pendingUploads')) {
            console.log('Creating pendingUploads object store');
            const pendingUploadsStore = database.createObjectStore('pendingUploads', { keyPath: 'id' });
            if (!pendingUploadsStore.indexNames.contains('by-timestamp')) {
              pendingUploadsStore.createIndex('by-timestamp', 'timestamp');
            }
          }
          
          if (!database.objectStoreNames.contains('mapTiles')) {
            console.log('Creating mapTiles object store');
            const mapTilesStore = database.createObjectStore('mapTiles', { keyPath: 'id' });
            if (!mapTilesStore.indexNames.contains('by-coordinates')) {
              mapTilesStore.createIndex('by-coordinates', ['z', 'x', 'y']);
            }
          }
        },
        blocked() {
          console.warn('Database opening blocked, another tab may be using it');
        },
        blocking() {
          console.warn('This tab is blocking database opening in another tab');
        },
        terminated() {
          console.error('Database connection was terminated unexpectedly');
          db = null;
          initPromise = null;
        }
      });
      
      db = database;
      console.log('Database initialized successfully');
      resolve(database);
    } catch (error) {
      console.error('Failed to initialize database:', error);
      initPromise = null;
      reject(error);
    }
  });
  
  return initPromise;
};

// Get all journeys
export const getAllJourneys = async () => {
  try {
    const db = await initDB();
    return db.getAll('journeys');
  } catch (error) {
    console.error('Failed to get journeys:', error);
    return [];
  }
};

// Get a specific journey
export const getJourney = async (id: string) => {
  try {
    const db = await initDB();
    return db.get('journeys', id);
  } catch (error) {
    console.error(`Failed to get journey ${id}:`, error);
    return null;
  }
};

/**
 * Save a journey to IndexedDB
 */
export const saveJourney = async (journey: Journey): Promise<Journey> => {
  console.log('Saving journey:', journey);
  try {
    const db = await initDB();
    
    if (!db) {
      console.error('Failed to open database for saving journey');
      throw new Error('Failed to open database');
    }
    
    // Ensure editStatus and syncStatus have proper values
    const updatedJourney = {
      ...journey,
      syncStatus: journey.syncStatus || 'pending',
      days: journey.days.map(day => ({
        ...day,
        editStatus: day.editStatus || 'draft'
      })),
      lastModified: new Date().toISOString()
    };

    const transaction = db.transaction('journeys', 'readwrite');
    const store = transaction.objectStore('journeys');
    
    console.log('Putting journey in store:', updatedJourney);
    await store.put(updatedJourney);
    
    await transaction.done;
    console.log('Journey saved successfully:', updatedJourney.id);
    
    // Update the journeys list in offline storage
    const offlineStorage = await db.get('offlineStorage', 'offlineStorage') as OfflineStorage;
    if (!offlineStorage) {
      // If offline storage doesn't exist yet, create it
      await db.put('offlineStorage', {
        journeys: {
          current: journey.id,
          list: [journey.id]
        },
        pendingUploads: []
      }, 'offlineStorage');
    } else if (!offlineStorage.journeys.list.includes(journey.id)) {
      offlineStorage.journeys.list.push(journey.id);
      await db.put('offlineStorage', offlineStorage, 'offlineStorage');
    }
    
    return updatedJourney;
  } catch (error) {
    console.error('Error saving journey:', error);
    throw error;
  }
};

// Delete a journey
export const deleteJourney = async (id: string) => {
  try {
    const db = await initDB();
    await db.delete('journeys', id);
    
    // Update the journeys list in offline storage
    const offlineStorage = await db.get('offlineStorage', 'offlineStorage') as OfflineStorage;
    if (offlineStorage) {
      offlineStorage.journeys.list = offlineStorage.journeys.list.filter(journeyId => journeyId !== id);
      if (offlineStorage.journeys.current === id) {
        offlineStorage.journeys.current = offlineStorage.journeys.list[0] || '';
      }
      await db.put('offlineStorage', offlineStorage, 'offlineStorage');
    }
  } catch (error) {
    console.error(`Failed to delete journey ${id}:`, error);
    throw error;
  }
};

// Add a day to a journey
export const addDayToJourney = async (journeyId: string, day: JourneyDay) => {
  try {
    const db = await initDB();
    const journey = await db.get('journeys', journeyId);
    if (!journey) {
      throw new Error(`Journey with ID ${journeyId} not found`);
    }
    
    journey.days.push(day);
    journey.days.sort((a: JourneyDay, b: JourneyDay) => new Date(a.date).getTime() - new Date(b.date).getTime());
    await db.put('journeys', journey);
    
    // Add to pending uploads if offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const pendingUpload: PendingUpload = {
        id: `upload-${Date.now()}`,
        type: 'newPeriod',
        journeyId,
        periodId: day.id,
        data: day,
        timestamp: new Date().toISOString()
      };
      await db.add('pendingUploads', pendingUpload);
    }
    
    return journey;
  } catch (error) {
    console.error(`Failed to add day to journey ${journeyId}:`, error);
    throw error;
  }
};

// Update a day in a journey
export const updateDay = async (journeyId: string, dayId: string, updatedDay: Partial<JourneyDay>) => {
  try {
    const db = await initDB();
    const journey = await db.get('journeys', journeyId);
    if (!journey) {
      throw new Error(`Journey with ID ${journeyId} not found`);
    }
    
    const dayIndex = journey.days.findIndex((d: JourneyDay) => d.id === dayId);
    if (dayIndex === -1) {
      throw new Error(`Day with ID ${dayId} not found in journey ${journeyId}`);
    }
    
    journey.days[dayIndex] = { ...journey.days[dayIndex], ...updatedDay };
    await db.put('journeys', journey);
    
    // Add to pending uploads if offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const pendingUpload: PendingUpload = {
        id: `upload-${Date.now()}`,
        type: 'modifyPeriod',
        journeyId,
        periodId: dayId,
        data: updatedDay,
        timestamp: new Date().toISOString()
      };
      await db.add('pendingUploads', pendingUpload);
    }
    
    return journey;
  } catch (error) {
    console.error(`Failed to update day ${dayId} in journey ${journeyId}:`, error);
    throw error;
  }
};

// Get all pending uploads
export const getPendingUploads = async () => {
  try {
    const db = await initDB();
    return db.getAllFromIndex('pendingUploads', 'by-timestamp');
  } catch (error) {
    console.error('Failed to get pending uploads:', error);
    return [];
  }
};

// Process pending uploads (to be called when online)
export const processPendingUploads = async () => {
  try {
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
  } catch (error) {
    console.error('Failed to process pending uploads:', error);
    return 0;
  }
};

// Cache a map tile
export const cacheMapTile = async (z: number, x: number, y: number, data: string) => {
  try {
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
    
    await db.put('mapTiles', tile);
  } catch (error) {
    console.error(`Failed to cache map tile (${z},${x},${y}):`, error);
  }
};

// Get a cached map tile
export const getCachedMapTile = async (z: number, x: number, y: number) => {
  try {
    const db = await initDB();
    const tiles = await db.getAllFromIndex('mapTiles', 'by-coordinates', [z, x, y]);
    if (tiles.length === 0) {
      return null;
    }
    
    const tile = tiles[0];
    const now = new Date();
    const expires = new Date(tile.expires);
    
    if (now > expires) {
      // Tile is expired, delete it
      await db.delete('mapTiles', tile.id);
      return null;
    }
    
    return tile;
  } catch (error) {
    console.error(`Failed to get cached map tile (${z},${x},${y}):`, error);
    return null;
  }
}; 