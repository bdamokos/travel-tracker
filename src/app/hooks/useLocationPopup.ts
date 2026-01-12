/**
 * Hook for managing LocationPopup state
 * Provides unified popup management for both map and calendar interactions
 */

'use client';

import { useState, useCallback } from 'react';
import { Location, JourneyDay } from '@/app/types';
import { LocationPopupData } from '@/app/components/LocationPopup';

interface UseLocationPopupResult {
  isOpen: boolean;
  data: LocationPopupData | null;
  openPopup: (location: Location, day: JourneyDay, tripId: string) => void;
  closePopup: () => void;
}

export function useLocationPopup(): UseLocationPopupResult {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<LocationPopupData | null>(null);

  const openPopup = useCallback((location: Location, day: JourneyDay, tripId: string) => {
    setData({ location, day, tripId });
    setIsOpen(true);
  }, []);

  const closePopup = useCallback(() => {
    setIsOpen(false);
    // Keep data available during close animation
    setTimeout(() => setData(null), 300);
  }, []);

  return {
    isOpen,
    data,
    openPopup,
    closePopup
  };
}