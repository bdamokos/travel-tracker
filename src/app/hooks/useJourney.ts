import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Journey, JourneyDay, Location, Transportation, InstagramPost } from '../types';
import * as storageService from '../services/storage';

export const useJourney = (journeyId?: string) => {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Update online status
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load journey data
  useEffect(() => {
    const loadJourney = async () => {
      try {
        setLoading(true);
        setError(null);

        if (journeyId) {
          const loadedJourney = await storageService.getJourney(journeyId);
          if (loadedJourney) {
            setJourney(loadedJourney);
          } else {
            setError(`Journey with ID ${journeyId} not found`);
          }
        } else {
          // If no journey ID provided, load the current journey or the first one
          const journeys = await storageService.getAllJourneys();
          if (journeys && journeys.length > 0) {
            setJourney(journeys[0]);
          } else {
            setJourney(null);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load journey');
      } finally {
        setLoading(false);
      }
    };

    loadJourney();
  }, [journeyId]);

  // Create a new journey
  const createJourney = useCallback(async (journeyData: Partial<Journey>) => {
    try {
      const id = uuidv4();
      const newJourney: Journey = {
        id,
        title: journeyData.title || 'New Journey',
        startDate: journeyData.startDate || new Date().toISOString().split('T')[0],
        endDate: journeyData.endDate,
        syncStatus: isOnline ? 'synced' : 'pending',
        days: journeyData.days || [],
        lastSynced: isOnline ? new Date().toISOString() : undefined,
      };

      const savedJourney = await storageService.saveJourney(newJourney);
      setJourney(savedJourney);
      return savedJourney;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create journey');
      throw err;
    }
  }, [isOnline]);

  // Add a day to the journey
  const addDay = useCallback(async (dayData: Partial<JourneyDay>) => {
    try {
      if (!journey) {
        throw new Error('No journey loaded');
      }

      const newDay: JourneyDay = {
        id: uuidv4(),
        date: dayData.date || new Date().toISOString().split('T')[0],
        title: dayData.title || `Day ${journey.days.length + 1}`,
        locations: dayData.locations || [],
        transportation: dayData.transportation,
        instagramPosts: dayData.instagramPosts || [],
        customNotes: dayData.customNotes,
        editStatus: isOnline ? 'synced' : 'draft',
      };

      const updatedJourney = await storageService.addDayToJourney(journey.id, newDay);
      setJourney(updatedJourney);
      return newDay;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add day');
      throw err;
    }
  }, [journey, isOnline]);

  // Update a day in the journey
  const updateDay = useCallback(async (dayId: string, dayData: Partial<JourneyDay>) => {
    try {
      if (!journey) {
        throw new Error('No journey loaded');
      }

      const updatedDayData = {
        ...dayData,
        editStatus: isOnline ? 'synced' : 'modified',
      };

      const updatedJourney = await storageService.updateDay(journey.id, dayId, updatedDayData);
      setJourney(updatedJourney);
      return updatedJourney.days.find(day => day.id === dayId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update day');
      throw err;
    }
  }, [journey, isOnline]);

  // Add a location to a day
  const addLocation = useCallback(async (dayId: string, locationData: Partial<Location>) => {
    try {
      if (!journey) {
        throw new Error('No journey loaded');
      }

      const day = journey.days.find(d => d.id === dayId);
      if (!day) {
        throw new Error(`Day with ID ${dayId} not found`);
      }

      const newLocation: Location = {
        id: uuidv4(),
        name: locationData.name || 'New Location',
        coordinates: locationData.coordinates || [0, 0],
        arrivalTime: locationData.arrivalTime,
        notes: locationData.notes,
      };

      const updatedLocations = [...day.locations, newLocation];
      const updatedDay = {
        ...day,
        locations: updatedLocations,
        editStatus: isOnline ? 'synced' : 'modified',
      };

      const updatedJourney = await storageService.updateDay(journey.id, dayId, updatedDay);
      setJourney(updatedJourney);
      return newLocation;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add location');
      throw err;
    }
  }, [journey, isOnline]);

  // Add transportation to a day
  const addTransportation = useCallback(async (dayId: string, transportationData: Partial<Transportation>) => {
    try {
      if (!journey) {
        throw new Error('No journey loaded');
      }

      const day = journey.days.find(d => d.id === dayId);
      if (!day) {
        throw new Error(`Day with ID ${dayId} not found`);
      }

      const newTransportation: Transportation = {
        id: uuidv4(),
        type: transportationData.type || 'other',
        from: transportationData.from || '',
        to: transportationData.to || '',
        fromCoordinates: transportationData.fromCoordinates || [0, 0],
        toCoordinates: transportationData.toCoordinates || [0, 0],
        distance: transportationData.distance,
        departureTime: transportationData.departureTime,
        arrivalTime: transportationData.arrivalTime,
      };

      const updatedDay = {
        ...day,
        transportation: newTransportation,
        editStatus: isOnline ? 'synced' : 'modified',
      };

      const updatedJourney = await storageService.updateDay(journey.id, dayId, updatedDay);
      setJourney(updatedJourney);
      return newTransportation;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add transportation');
      throw err;
    }
  }, [journey, isOnline]);

  // Add Instagram post to a day
  const addInstagramPost = useCallback(async (dayId: string, postData: Partial<InstagramPost>) => {
    try {
      if (!journey) {
        throw new Error('No journey loaded');
      }

      const day = journey.days.find(d => d.id === dayId);
      if (!day) {
        throw new Error(`Day with ID ${dayId} not found`);
      }

      const newPost: InstagramPost = {
        id: uuidv4(),
        url: postData.url || '',
        offline: !isOnline || postData.offline || false,
      };

      const updatedPosts = [...(day.instagramPosts || []), newPost];
      const updatedDay = {
        ...day,
        instagramPosts: updatedPosts,
        editStatus: isOnline ? 'synced' : 'modified',
      };

      const updatedJourney = await storageService.updateDay(journey.id, dayId, updatedDay);
      setJourney(updatedJourney);
      return newPost;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add Instagram post');
      throw err;
    }
  }, [journey, isOnline]);

  // Sync pending changes with server
  const syncWithServer = useCallback(async () => {
    try {
      if (!isOnline) {
        throw new Error('Cannot sync while offline');
      }

      // Process any pending uploads
      const processedCount = await storageService.processPendingUploads();

      // Update journey sync status
      if (journey) {
        const updatedJourney = {
          ...journey,
          syncStatus: 'synced',
          lastSynced: new Date().toISOString(),
          days: journey.days.map(day => ({
            ...day,
            editStatus: 'synced',
          })),
        };

        const savedJourney = await storageService.saveJourney(updatedJourney);
        setJourney(savedJourney);
      }

      return processedCount;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync with server');
      throw err;
    }
  }, [journey, isOnline]);

  return {
    journey,
    loading,
    error,
    isOnline,
    createJourney,
    addDay,
    updateDay,
    addLocation,
    addTransportation,
    addInstagramPost,
    syncWithServer,
  };
}; 