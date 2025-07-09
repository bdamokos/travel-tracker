import { useState, useEffect } from 'react';
import { Accommodation } from '../types';

interface UseAccommodationsResult {
  accommodations: Accommodation[];
  loading: boolean;
  error: string | null;
  createAccommodation: (tripId: string, accommodation: Omit<Accommodation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Accommodation>;
  updateAccommodation: (tripId: string, accommodation: Accommodation) => Promise<Accommodation>;
  deleteAccommodation: (tripId: string, id: string) => Promise<void>;
  getAccommodationsByLocation: (locationId: string) => Accommodation[];
  getAccommodationById: (id: string) => Accommodation | undefined;
  loadAccommodationsForTrip: (tripId: string) => Promise<void>;
}

export function useAccommodations(tripId?: string): UseAccommodationsResult {
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccommodationsForTrip = async (targetTripId: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/admin/api/accommodations?tripId=${targetTripId}`);
      
      if (!response.ok) {
        throw new Error('Failed to load accommodations');
      }
      
      const data = await response.json();
      setAccommodations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const createAccommodation = async (targetTripId: string, accommodationData: Omit<Accommodation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Accommodation> => {
    try {
      const response = await fetch('/admin/api/accommodations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...accommodationData, tripId: targetTripId })
      });

      if (!response.ok) {
        throw new Error('Failed to create accommodation');
      }

      const newAccommodation = await response.json();
      setAccommodations(prev => [...prev, newAccommodation]);
      return newAccommodation;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  };

  const updateAccommodation = async (targetTripId: string, accommodation: Accommodation): Promise<Accommodation> => {
    try {
      const response = await fetch('/admin/api/accommodations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...accommodation, tripId: targetTripId })
      });

      if (!response.ok) {
        throw new Error('Failed to update accommodation');
      }

      const updatedAccommodation = await response.json();
      setAccommodations(prev => prev.map(acc => 
        acc.id === updatedAccommodation.id ? updatedAccommodation : acc
      ));
      return updatedAccommodation;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  };

  const deleteAccommodation = async (targetTripId: string, id: string): Promise<void> => {
    try {
      const response = await fetch(`/admin/api/accommodations?id=${id}&tripId=${targetTripId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete accommodation');
      }

      setAccommodations(prev => prev.filter(acc => acc.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  };

  const getAccommodationsByLocation = (locationId: string): Accommodation[] => {
    return accommodations.filter(acc => acc.locationId === locationId);
  };

  const getAccommodationById = (id: string): Accommodation | undefined => {
    return accommodations.find(acc => acc.id === id);
  };

  useEffect(() => {
    if (tripId) {
      loadAccommodationsForTrip(tripId);
    }
  }, [tripId]);

  return {
    accommodations,
    loading,
    error,
    createAccommodation,
    updateAccommodation,
    deleteAccommodation,
    getAccommodationsByLocation,
    getAccommodationById,
    loadAccommodationsForTrip
  };
}