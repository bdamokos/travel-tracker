'use client';

import { useState, useEffect } from 'react';
import { TravelReference, Accommodation, Location } from '../../types';
import { useAccommodations } from '../../hooks/useAccommodations';

interface TravelLinkDisplayProps {
  travelReference?: TravelReference;
  className?: string;
  onRemove?: () => void;
  showRemoveButton?: boolean;
}

interface TravelItemInfo {
  name: string;
  tripTitle: string;
  locationName?: string; // For accommodations
}

export default function TravelLinkDisplay({ 
  travelReference, 
  className = '', 
  onRemove, 
  showRemoveButton = false 
}: TravelLinkDisplayProps) {
  const [itemInfo, setItemInfo] = useState<TravelItemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const { getAccommodationById } = useAccommodations();

  useEffect(() => {
    if (!travelReference) {
      setLoading(false);
      return;
    }

    async function loadItemInfo() {
      try {
        if (travelReference!.type === 'accommodation' && travelReference!.accommodationId) {
          const accommodation = getAccommodationById(travelReference!.accommodationId);
          if (accommodation) {
            // Get location info for the accommodation
            const locationResponse = await fetch(`/api/travel-data/list`);
            const trips = await locationResponse.json();
            
            let locationName = '';
            let tripTitle = '';
            
            // Find the location this accommodation belongs to
            for (const trip of trips) {
              try {
                const tripResponse = await fetch(`/api/travel-data?id=${trip.id}`);
                const tripData = await tripResponse.json();
                const location = tripData.locations?.find((loc: Location) => loc.id === accommodation.locationId);
                if (location) {
                  locationName = location.name;
                  tripTitle = trip.title;
                  break;
                }
              } catch (error) {
                console.error('Error loading trip data:', error);
              }
            }
            
            setItemInfo({
              name: accommodation.name,
              tripTitle,
              locationName
            });
          }
        } else if (travelReference!.type === 'location' && travelReference!.locationId) {
          // Load location info
          const response = await fetch(`/api/travel-data/list`);
          const trips = await response.json();
          
          for (const trip of trips) {
            try {
              const tripResponse = await fetch(`/api/travel-data?id=${trip.id}`);
              const tripData = await tripResponse.json();
              const location = tripData.locations?.find((loc: Location) => loc.id === travelReference!.locationId);
              if (location) {
                setItemInfo({
                  name: location.name,
                  tripTitle: trip.title
                });
                break;
              }
            } catch (error) {
              console.error('Error loading trip data:', error);
            }
          }
        } else if (travelReference!.type === 'route' && travelReference!.routeId) {
          // Load route info
          const response = await fetch(`/api/travel-data/list`);
          const trips = await response.json();
          
          for (const trip of trips) {
            try {
              const tripResponse = await fetch(`/api/travel-data?id=${trip.id}`);
              const tripData = await tripResponse.json();
              const route = tripData.routes?.find((r: any) => r.id === travelReference!.routeId);
              if (route) {
                setItemInfo({
                  name: `${route.from} → ${route.to}`,
                  tripTitle: trip.title
                });
                break;
              }
            } catch (error) {
              console.error('Error loading trip data:', error);
            }
          }
        }
      } catch (error) {
        console.error('Error loading travel item info:', error);
      } finally {
        setLoading(false);
      }
    }

    loadItemInfo();
  }, [travelReference, getAccommodationById]);

  if (!travelReference) return null;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'location': return '📍';
      case 'accommodation': return '🏨';
      case 'route': return '🚌';
      default: return '🔗';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'location': return 'Location';
      case 'accommodation': return 'Accommodation';
      case 'route': return 'Route';
      default: return 'Travel Item';
    }
  };

  const getDisplayName = () => {
    if (loading) return 'Loading...';
    if (!itemInfo) return 'Unknown item';
    
    if (travelReference.type === 'accommodation') {
      return `${itemInfo.name} (in ${itemInfo.locationName || 'Unknown location'})`;
    }
    return itemInfo.name;
  };

  const getDisplayDescription = () => {
    if (travelReference.description) {
      return travelReference.description;
    }
    if (itemInfo?.tripTitle) {
      return itemInfo.tripTitle;
    }
    return null;
  };

  return (
    <div className={`inline-flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-1 rounded ${className}`}>
      <span>{getTypeIcon(travelReference.type)}</span>
      <span>{getTypeLabel(travelReference.type)}</span>
      <span className="font-medium">{getDisplayName()}</span>
      {getDisplayDescription() && (
        <span className="text-blue-600 dark:text-blue-400">
          • {getDisplayDescription()}
        </span>
      )}
      {showRemoveButton && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 text-red-500 hover:text-red-700 font-bold"
          title="Remove link"
        >
          ×
        </button>
      )}
    </div>
  );
}