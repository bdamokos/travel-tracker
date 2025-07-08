'use client';

import { useState, useEffect } from 'react';
import { TravelReference, Location, Transportation } from '../../types';

interface TravelItem {
  id: string;
  type: 'location' | 'route';
  name: string;
  description: string;
  date: string;
  tripTitle: string;
}

interface TravelItemSelectorProps {
  currentReference?: TravelReference;
  onReferenceChange: (reference: TravelReference | undefined) => void;
  className?: string;
}

export default function TravelItemSelector({
  currentReference,
  onReferenceChange,
  className = ''
}: TravelItemSelectorProps) {
  const [travelItems, setTravelItems] = useState<TravelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<'location' | 'accommodation' | 'route' | ''>('');
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [description, setDescription] = useState('');

  // Load current reference values
  useEffect(() => {
    if (currentReference) {
      setSelectedType(currentReference.type);
      setSelectedItem(currentReference.locationId || currentReference.routeId || '');
      setDescription(currentReference.description || '');
    }
  }, [currentReference]);

  // Load available travel items
  useEffect(() => {
    async function loadTravelItems() {
      try {
        const response = await fetch('/api/travel-data/list');
        const trips = await response.json();
        
        const allItems: TravelItem[] = [];
        
        // Load detailed data for each trip to get locations and routes
        for (const trip of trips) {
          try {
            const detailResponse = await fetch(`/api/travel-data?id=${trip.id}`);
            const tripData = await detailResponse.json();
            
            // Add locations
            if (tripData.locations) {
              tripData.locations.forEach((location: Location) => {
                allItems.push({
                  id: location.id,
                  type: 'location',
                  name: location.name,
                  description: location.notes || '',
                  date: location.date,
                  tripTitle: trip.title
                });
              });
            }
            
            // Add routes
            if (tripData.routes) {
              tripData.routes.forEach((route: { id: string; from: string; to: string; transportType: Transportation['type']; date: string }) => {
                allItems.push({
                  id: route.id,
                  type: 'route',
                  name: `${route.from} → ${route.to}`,
                  description: `${route.transportType} transport`,
                  date: route.date,
                  tripTitle: trip.title
                });
              });
            }
          } catch (error) {
            console.error(`Error loading trip details for ${trip.id}:`, error);
          }
        }
        
        // Sort by date
        allItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setTravelItems(allItems);
      } catch (error) {
        console.error('Error loading travel items:', error);
      } finally {
        setLoading(false);
      }
    }
    
    loadTravelItems();
  }, []);

  const handleTypeChange = (type: string) => {
    setSelectedType(type as 'location' | 'accommodation' | 'route' | '');
    setSelectedItem('');
    updateReference(type, '', description);
  };

  const handleItemChange = (itemId: string) => {
    setSelectedItem(itemId);
    updateReference(selectedType, itemId, description);
  };

  const handleDescriptionChange = (desc: string) => {
    setDescription(desc);
    updateReference(selectedType, selectedItem, desc);
  };

  const updateReference = (type: string, itemId: string, desc: string) => {
    if (!type || !itemId) {
      onReferenceChange(undefined);
      return;
    }

    const selectedTravelItem = travelItems.find(item => item.id === itemId);
    if (!selectedTravelItem) return;

    const reference: TravelReference = {
      type: type === 'accommodation' ? 'location' : selectedTravelItem.type,
      description: desc || selectedTravelItem.name
    };

    if (selectedTravelItem.type === 'location') {
      reference.locationId = itemId;
    } else if (selectedTravelItem.type === 'route') {
      reference.routeId = itemId;
    }

    onReferenceChange(reference);
  };

  const handleClear = () => {
    setSelectedType('');
    setSelectedItem('');
    setDescription('');
    onReferenceChange(undefined);
  };

  if (loading) {
    return (
      <div className={`text-sm text-gray-500 dark:text-gray-400 ${className}`}>
        Loading travel items...
      </div>
    );
  }

  const filteredItems = travelItems.filter(item => {
    if (selectedType === 'accommodation') {
      return item.type === 'location';
    }
    return item.type === selectedType;
  });

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Link to Travel Item (Optional)
        </label>
        <select
          value={selectedType}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="">Select type...</option>
          <option value="location">Location</option>
          <option value="accommodation">Accommodation</option>
          <option value="route">Transportation Route</option>
        </select>
      </div>

      {selectedType && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {selectedType === 'accommodation' ? 'Location (for accommodation)' : 
             selectedType === 'location' ? 'Location' : 'Route'}
          </label>
          <select
            value={selectedItem}
            onChange={(e) => handleItemChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">Select {selectedType}...</option>
            {filteredItems.map(item => (
              <option key={item.id} value={item.id}>
                {item.name} - {item.tripTitle} ({item.date})
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedItem && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Link Description (Optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            placeholder={
              selectedType === 'accommodation' ? 'e.g., Hotel booking deposit' :
              selectedType === 'location' ? 'e.g., Activities at this location' :
              'e.g., Flight ticket, Train booking'
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
      )}

      {currentReference && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-600 dark:text-green-400">
            ✓ Linked to {selectedType}
          </span>
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-red-600 dark:text-red-400 hover:underline"
          >
            Clear link
          </button>
        </div>
      )}

      {travelItems.length === 0 && !loading && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          No travel items found. Create some travel data first to link expenses.
        </div>
      )}
    </div>
  );
}