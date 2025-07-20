'use client';

import { useState, useEffect } from 'react';
import { Location, Transportation, Accommodation } from '../../types';
import { ExpenseTravelLookup, TravelLinkInfo } from '../../lib/expenseTravelLookup';
import { useExpenseLinks } from '../../hooks/useExpenseLinks';
import AriaSelect from './AriaSelect';

interface TravelItem {
  id: string;
  type: 'location' | 'accommodation' | 'route';
  name: string;
  description: string;
  date: string;
  tripTitle: string;
  locationName?: string; // For accommodations
}

interface TravelItemSelectorProps {
  expenseId: string;
  tripId: string;
  // Legacy prop - kept for backward compatibility but not used
  travelLookup?: ExpenseTravelLookup | null;
  onReferenceChange: (travelLinkInfo: TravelLinkInfo | undefined) => void;
  className?: string;
}

export default function TravelItemSelector({
  expenseId,
  tripId,
  onReferenceChange,
  className = ''
}: TravelItemSelectorProps) {
  const [travelItems, setTravelItems] = useState<TravelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<'location' | 'accommodation' | 'route' | ''>('');
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [description, setDescription] = useState('');

  // Use our new SWR hooks for real-time data
  const { expenseLinks } = useExpenseLinks(tripId);

  // Load current reference values using SWR data
  useEffect(() => {
    if (expenseId && expenseLinks.length > 0) {
      const currentLink = expenseLinks.find(link => link.expenseId === expenseId);
      if (currentLink) {
        setSelectedType(currentLink.travelItemType);
        setSelectedItem(currentLink.travelItemId);
        setDescription(currentLink.description || '');
      }
    }
  }, [expenseLinks, expenseId]);

  // Load available travel items from current trip only
  useEffect(() => {
    async function loadTravelItems() {
      if (!tripId) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/travel-data?id=${tripId}`);
        const tripData = await response.json();
        
        const allItems: TravelItem[] = [];
        
        // Add locations
        if (tripData.locations) {
          tripData.locations.forEach((location: Location) => {
            allItems.push({
              id: location.id,
              type: 'location',
              name: location.name,
              description: location.notes || '',
              date: location.date instanceof Date ? location.date.toISOString().split('T')[0] : location.date,
              tripTitle: tripData.title
            });
          });
        }
        
        // Add routes
        if (tripData.routes) {
          tripData.routes.forEach((route: { id: string; from: string; to: string; transportType: Transportation['type']; date: Date }) => {
            allItems.push({
              id: route.id,
              type: 'route',
              name: `${route.from} → ${route.to}`,
              description: `${route.transportType} transport`,
              date: route.date instanceof Date ? route.date.toISOString().split('T')[0] : route.date,
              tripTitle: tripData.title
            });
          });
        }
        
        // Add accommodations from unified trip data
        if (tripData.accommodations) {
          tripData.accommodations.forEach((accommodation: Accommodation) => {
            // Find the location for this accommodation
            const location = allItems.find(item => item.type === 'location' && item.id === accommodation.locationId);
            allItems.push({
              id: accommodation.id,
              type: 'accommodation',
              name: accommodation.name,
              description: accommodation.accommodationData?.substring(0, 100) || '',
              date: location?.date || '',
              tripTitle: tripData.title,
              locationName: location?.name
            });
          });
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
  }, [tripId]);

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

    const travelLinkInfo: TravelLinkInfo = {
      type: selectedTravelItem.type as 'location' | 'accommodation' | 'route',
      id: itemId,
      name: desc || selectedTravelItem.name,
      tripTitle: selectedTravelItem.tripTitle,
    };

    if (selectedTravelItem.type === 'accommodation') {
      travelLinkInfo.locationName = selectedTravelItem.locationName;
    }

    onReferenceChange(travelLinkInfo);
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
    return item.type === selectedType;
  });

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Link to Travel Item (Optional)
        </label>
        <AriaSelect
          id="travel-type-select"
          value={selectedType}
          onChange={(value) => handleTypeChange(value)}
          options={[
            { value: 'location', label: 'Location' },
            { value: 'accommodation', label: 'Accommodation' },
            { value: 'route', label: 'Transportation Route' }
          ]}
          placeholder="Select type..."
        />
      </div>

      {selectedType && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {selectedType === 'accommodation' ? 'Accommodation' : 
             selectedType === 'location' ? 'Location' : 'Route'}
          </label>
          <AriaSelect
            id="travel-item-select"
            value={selectedItem}
            onChange={(value) => handleItemChange(value)}
            options={filteredItems.map(item => ({
              value: item.id,
              label: item.type === 'accommodation' ? 
                `${item.name} (in ${item.locationName}) - ${item.date}` :
                `${item.name} - ${item.date}`
            }))}
            placeholder={`Select ${selectedType}...`}
          />
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

      {selectedType && selectedItem && (
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