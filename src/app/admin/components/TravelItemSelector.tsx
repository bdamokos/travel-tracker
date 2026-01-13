'use client';

import { useState, useEffect, useMemo } from 'react';
import { Location, Transportation, Accommodation } from '@/app/types';
import { ExpenseTravelLookup, TravelLinkInfo } from '@/app/lib/expenseTravelLookup';
import { useExpenseLinks } from '@/app/hooks/useExpenseLinks';
import AriaSelect from '@/app/admin/components/AriaSelect';
import { buildSideTripMap } from '@/app/lib/sideTripUtils';

interface TravelItem {
  id: string;
  type: 'location' | 'accommodation' | 'route';
  name: string;
  description: string;
  date: string;
  tripTitle: string;
  locationName?: string; // For accommodations
  baseLocationId?: string;
  parentRouteId?: string; // For route segments (subRoutes)
  parentRouteName?: string; // For displaying hierarchy
}

const normalizeDateString = (dateValue?: string | Date | null) => {
  if (!dateValue) {
    return null;
  }

  if (dateValue instanceof Date) {
    return Number.isNaN(dateValue.getTime())
      ? null
      : dateValue.toISOString().split('T')[0];
  }

  if (typeof dateValue === 'string') {
    const trimmed = dateValue.trim();
    if (!trimmed) {
      return null;
    }

    const isoMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
    if (isoMatch) {
      return isoMatch[0];
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime())
      ? null
      : parsed.toISOString().split('T')[0];
  }

  return null;
};

const formatItemLabel = (item: TravelItem) => {
  const dateLabel = item.date ? item.date : 'Date not set';

  if (item.type === 'accommodation') {
    const locationSuffix = item.locationName ? ` (in ${item.locationName})` : '';
    return `${item.name}${locationSuffix} - ${dateLabel}`;
  }

  if (item.type === 'route' && item.parentRouteName) {
    // This is a sub-route segment
    return `  ↳ ${item.name} - ${dateLabel}`;
  }

  return `${item.name} - ${dateLabel}`;
};

const formatContextLabel = (
  item: TravelItem,
  context?: 'matching' | 'previous' | 'next' | 'base'
) => {
  const baseLabel = formatItemLabel(item);

  if (!context) {
    return baseLabel;
  }

  const contextSuffix =
    context === 'matching'
      ? ' [matching date]'
      : context === 'previous'
        ? ' [previous date]'
        : context === 'next'
          ? ' [next date]'
          : ' [base stay]';

  return `${baseLabel}${contextSuffix}`;
};

interface TravelItemSelectorProps {
  expenseId: string;
  tripId: string;
  // Legacy prop - kept for backward compatibility but not used
  travelLookup?: ExpenseTravelLookup | null;
  onReferenceChange: (travelLinkInfo: TravelLinkInfo | undefined) => void;
  className?: string;
  initialValue?: TravelLinkInfo;
  transactionDate?: Date | string | null;
  transactionDates?: Array<Date | string | null>;
}

export default function TravelItemSelector({
  expenseId,
  tripId,
  onReferenceChange,
  className = '',
  initialValue,
  transactionDate,
  transactionDates
}: TravelItemSelectorProps) {
  const [travelItems, setTravelItems] = useState<TravelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<'location' | 'accommodation' | 'route' | ''>('');
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [description, setDescription] = useState('');

  // Use our new SWR hooks for real-time data
  const { expenseLinks } = useExpenseLinks(tripId);

  // Load current reference values using SWR data or initialValue
  useEffect(() => {
    // First, try to use initialValue if provided
    if (initialValue) {
      setSelectedType(initialValue.type);
      setSelectedItem(initialValue.id);
      setDescription(initialValue.name || '');
      return;
    }

    // Fallback to SWR data
    if (expenseId && expenseLinks.length > 0) {
      const currentLink = expenseLinks.find(link => link.expenseId === expenseId);
      if (currentLink) {
        setSelectedType(currentLink.travelItemType);
        setSelectedItem(currentLink.travelItemId);
        setDescription(currentLink.description || '');
      }
    }
  }, [expenseLinks, expenseId, initialValue]);

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

        const sideTripMap = buildSideTripMap(tripData.locations || []);

        // Add locations
        if (tripData.locations) {
          tripData.locations.forEach((location: Location) => {
            const baseLocation = sideTripMap.get(location.id);
            allItems.push({
              id: location.id,
              type: 'location',
              name: location.name,
              description: location.notes || '',
              date: location.date instanceof Date ? location.date.toISOString().split('T')[0] : location.date,
              tripTitle: tripData.title,
              baseLocationId: baseLocation?.id
            });
          });
        }
        
        // Add routes and their sub-routes
        if (tripData.routes) {
          tripData.routes.forEach((route: Transportation) => {
            const routeDate = route.date instanceof Date ? route.date.toISOString().split('T')[0] : route.date;
            const routeName = `${route.from} → ${route.to}`;

            // Add parent route
            allItems.push({
              id: route.id,
              type: 'route',
              name: routeName,
              description: `${route.type} transport`,
              date: routeDate,
              tripTitle: tripData.title
            });

            // Add sub-routes if they exist
            if (route.subRoutes && route.subRoutes.length > 0) {
              route.subRoutes.forEach((subRoute) => {
                allItems.push({
                  id: subRoute.id,
                  type: 'route',
                  name: `${subRoute.from} → ${subRoute.to}`,
                  description: `${subRoute.type} transport (segment)`,
                  date: routeDate, // Sub-routes share the parent route's date
                  tripTitle: tripData.title,
                  parentRouteId: route.id,
                  parentRouteName: routeName
                });
              });
            }
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

  const normalizedTransactionDates = useMemo(() => {
    const values: Array<Date | string | null | undefined> = [transactionDate];

    if (Array.isArray(transactionDates)) {
      values.push(...transactionDates);
    }

    const uniqueDates = new Set<string>();

    values.forEach(value => {
      const normalized = normalizeDateString(value ?? null);
      if (normalized) {
        uniqueDates.add(normalized);
      }
    });

    return Array.from(uniqueDates).sort((a, b) => Date.parse(a) - Date.parse(b));
  }, [transactionDate, transactionDates]);

  const itemsForSelectedType = useMemo(() => {
    type TravelItemWithMeta = TravelItem & {
      normalizedDate: string | null;
      timestamp: number | null;
    };

    const withMeta: TravelItemWithMeta[] = travelItems
      .filter(item => item.type === selectedType)
      .map(item => {
        const normalizedDate = normalizeDateString(item.date);
        const timestamp = normalizedDate ? Date.parse(normalizedDate) : null;
        return {
          ...item,
          normalizedDate,
          timestamp
        };
      });

    withMeta.sort((a, b) => {
      if (a.timestamp === null && b.timestamp === null) {
        return a.name.localeCompare(b.name);
      }
      if (a.timestamp === null) {
        return 1;
      }
      if (b.timestamp === null) {
        return -1;
      }
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      return a.name.localeCompare(b.name);
    });

    return withMeta;
  }, [selectedType, travelItems]);

  const selectOptions = useMemo(() => {
    type SelectOption = { value: string; label: string; disabled?: boolean; key?: string };

    const buildBaseOptions = (): SelectOption[] =>
      itemsForSelectedType.map(item => ({
        value: item.id,
        label: formatContextLabel(item, undefined),
        key: `base-${item.id}`
      }));

    if (!selectedType || !itemsForSelectedType.length) {
      return buildBaseOptions();
    }

    const travelItemById = new Map(travelItems.map(item => [item.id, item]));

    if (!normalizedTransactionDates.length) {
      return buildBaseOptions();
    }

    const topOptions: SelectOption[] = [];
    const priorityIds = new Set<string>();

    const addPriorityOption = (item: TravelItem, context: 'matching' | 'previous' | 'next' | 'base') => {
      if (priorityIds.has(item.id)) {
        return;
      }
      priorityIds.add(item.id);
      topOptions.push({
        value: item.id,
        label: formatContextLabel(item, context),
        key: `priority-${context}-${item.id}`
      });
    };

    const includeBaseIfNeeded = (item: TravelItem) => {
      if (selectedType !== 'location') return;
      const baseId = item.baseLocationId;
      if (!baseId || baseId === item.id) return;
      const baseItem = travelItemById.get(baseId);
      if (!baseItem || baseItem.type !== 'location') return;
      addPriorityOption(baseItem, 'base');
    };

    const findPreviousItem = (timestamp: number) => {
      for (let index = itemsForSelectedType.length - 1; index >= 0; index -= 1) {
        const candidate = itemsForSelectedType[index];
        if (candidate.timestamp !== null && candidate.timestamp < timestamp) {
          return candidate;
        }
      }
      return undefined;
    };

    const findNextItem = (timestamp: number) => {
      for (let index = 0; index < itemsForSelectedType.length; index += 1) {
        const candidate = itemsForSelectedType[index];
        if (candidate.timestamp !== null && candidate.timestamp > timestamp) {
          return candidate;
        }
      }
      return undefined;
    };

    normalizedTransactionDates.forEach(dateString => {
      const transactionTimestamp = Date.parse(dateString);
      if (Number.isNaN(transactionTimestamp)) {
        return;
      }

      const matchingItems = itemsForSelectedType.filter(item => item.normalizedDate === dateString);

      matchingItems.forEach(item => {
        addPriorityOption(item, 'matching');
        includeBaseIfNeeded(item);
      });

      const previousItem = findPreviousItem(transactionTimestamp);
      if (previousItem && !matchingItems.some(item => item.id === previousItem.id)) {
        addPriorityOption(previousItem, 'previous');
        includeBaseIfNeeded(previousItem);
      }

      const nextItem = findNextItem(transactionTimestamp);
      if (
        nextItem &&
        !matchingItems.some(item => item.id === nextItem.id) &&
        (!previousItem || previousItem.id !== nextItem.id)
      ) {
        addPriorityOption(nextItem, 'next');
        includeBaseIfNeeded(nextItem);
      }
    });

    if (!topOptions.length) {
      return buildBaseOptions();
    }

    return [
      ...topOptions,
      { value: '__separator__', label: '----', disabled: true, key: 'separator' },
      ...buildBaseOptions()
    ];
  }, [itemsForSelectedType, normalizedTransactionDates, selectedType, travelItems]);

  const handleTypeChange = (type: string) => {
    setSelectedType(type as 'location' | 'accommodation' | 'route' | '');
    setSelectedItem('');
    updateReference(type, '', description);
  };

  const handleItemChange = (itemId: string) => {
    if (itemId === '__separator__') {
      return;
    }

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
            options={selectOptions}
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
