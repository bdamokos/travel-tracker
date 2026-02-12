'use client';

import { useState, useEffect, useId, useMemo } from 'react';
import { Location, Accommodation } from '@/app/types';
import { ExpenseTravelLookup, TravelLinkInfo } from '@/app/lib/expenseTravelLookup';
import { useExpenseLinks } from '@/app/hooks/useExpenseLinks';
import AriaSelect from '@/app/admin/components/AriaSelect';
import { buildSideTripMap } from '@/app/lib/sideTripUtils';
import { formatLocalDateInput, getLocalDateSortValue } from '@/app/lib/localDateUtils';
import { resolveTravelItemDate, resolveTravelItemTransportType } from '@/app/admin/components/travelItemSelectorUtils';

interface TravelItem {
  id: string;
  type: 'location' | 'accommodation' | 'route';
  name: string;
  description: string;
  date?: string; // Optional since some items may not have a valid date source
  tripTitle: string;
  locationName?: string; // For accommodations
  baseLocationId?: string;
  parentRouteId?: string; // For route segments (subRoutes)
  parentRouteName?: string; // For displaying hierarchy
}

type TravelItemRouteSegment = {
  id: string;
  from: string;
  to: string;
  date?: Date | string | null;
  departureTime?: string | null;
  transportType?: string | null;
  type?: string | null;
};

type TravelItemRoute = TravelItemRouteSegment & {
  subRoutes?: TravelItemRouteSegment[];
};

const normalizeDateString = (dateValue?: string | Date | null) => {
  if (!dateValue) {
    return null;
  }

  const formatted = formatLocalDateInput(dateValue);
  return formatted || null;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

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
  showMostLikelyQuickLink?: boolean;
}

export default function TravelItemSelector({
  expenseId,
  tripId,
  onReferenceChange,
  className = '',
  initialValue,
  transactionDate,
  transactionDates,
  showMostLikelyQuickLink = false
}: TravelItemSelectorProps) {
  const [travelItems, setTravelItems] = useState<TravelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedType, setSelectedType] = useState<'location' | 'accommodation' | 'route' | ''>('');
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [description, setDescription] = useState('');
  const id = useId();

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
    let isCurrent = true;
    const controller = new AbortController();
    let timeoutId: number | null = null;

    async function loadTravelItems() {
      if (isCurrent) {
        setLoading(true);
        setLoadError(null);
      }

      if (!tripId) {
        if (isCurrent) {
          setTravelItems([]);
          setLoading(false);
        }
        return;
      }

      timeoutId = window.setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(`/api/travel-data?id=${tripId}`, { signal: controller.signal });
        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          console.error('Failed to load travel items response', {
            tripId,
            status: response.status,
            errorBody
          });
          throw new Error('Unable to load travel items. Please try again later.');
        }

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
              date: formatLocalDateInput(location.date),
              tripTitle: tripData.title,
              baseLocationId: baseLocation?.id
            });
          });
        }
        
        // Add routes and their sub-routes
        if (tripData.routes) {
          tripData.routes.forEach((route: TravelItemRoute) => {
            const routeDate = resolveTravelItemDate(route);
            const routeTransportType = resolveTravelItemTransportType(route);
            const routeName = `${route.from} → ${route.to}`;

            // Add parent route
            allItems.push({
              id: route.id,
              type: 'route',
              name: routeName,
              description: `${routeTransportType} transport`,
              date: routeDate,
              tripTitle: tripData.title
            });

            // Add sub-routes if they exist
            if (route.subRoutes && route.subRoutes.length > 0) {
              route.subRoutes.forEach((subRoute) => {
                const subRouteDate = resolveTravelItemDate(subRoute) ?? routeDate;
                const subRouteTransportType = resolveTravelItemTransportType(subRoute, routeTransportType);

                allItems.push({
                  id: subRoute.id,
                  type: 'route',
                  name: `${subRoute.from} → ${subRoute.to}`,
                  description: `${subRouteTransportType} transport (segment)`,
                  date: subRouteDate,
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
        
        // Sort by date (items without dates go to the end)
        allItems.sort((a, b) => {
          const dateA = getLocalDateSortValue(a.date);
          const dateB = getLocalDateSortValue(b.date);
          return dateA - dateB;
        });

        if (isCurrent) {
          setTravelItems(allItems);
        }
      } catch (error) {
        if (!isCurrent) {
          return;
        }
        console.error('Error loading travel items:', error);
        if (error instanceof Error && error.name === 'AbortError') {
          setLoadError('Loading travel items timed out. Please try again.');
        } else {
          setLoadError('Unable to load travel items. Please try again later.');
        }
      } finally {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        if (isCurrent) {
          setLoading(false);
        }
      }
    }
    
    loadTravelItems();

    return () => {
      isCurrent = false;
      controller.abort();
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [tripId, reloadToken]);

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
        const timestamp = normalizedDate ? getLocalDateSortValue(normalizedDate) : null;
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

  const mostLikelyCandidate = useMemo(() => {
    if (!normalizedTransactionDates.length || travelItems.length === 0) {
      return undefined;
    }

    const transactionTimestamps = normalizedTransactionDates
      .map(dateValue => getLocalDateSortValue(dateValue))
      .filter(timestamp => Number.isFinite(timestamp));

    if (!transactionTimestamps.length) {
      return undefined;
    }

    const typePriority: Record<TravelItem['type'], number> = {
      location: 0,
      accommodation: 1,
      route: 2
    };

    const candidates = travelItems
      .map(item => {
        const normalizedDate = normalizeDateString(item.date);
        if (!normalizedDate) {
          return null;
        }

        const itemTimestamp = getLocalDateSortValue(normalizedDate);
        if (!Number.isFinite(itemTimestamp)) {
          return null;
        }

        const nearestDays = transactionTimestamps.reduce((minimum, transactionTimestamp) => {
          const diffDays = Math.round(Math.abs(itemTimestamp - transactionTimestamp) / MS_PER_DAY);
          return Math.min(minimum, diffDays);
        }, Number.POSITIVE_INFINITY);

        return {
          item,
          nearestDays,
          typeRank: typePriority[item.type],
          itemTimestamp
        };
      })
      .filter((candidate): candidate is {
        item: TravelItem;
        nearestDays: number;
        typeRank: number;
        itemTimestamp: number;
      } => candidate !== null);

    if (!candidates.length) {
      return undefined;
    }

    candidates.sort((a, b) => {
      if (a.nearestDays !== b.nearestDays) {
        return a.nearestDays - b.nearestDays;
      }
      if (a.typeRank !== b.typeRank) {
        return a.typeRank - b.typeRank;
      }
      if (a.itemTimestamp !== b.itemTimestamp) {
        return a.itemTimestamp - b.itemTimestamp;
      }
      return a.item.name.localeCompare(b.item.name);
    });

    return candidates[0];
  }, [normalizedTransactionDates, travelItems]);

  const isMostLikelySelected = Boolean(
    mostLikelyCandidate &&
      selectedType === mostLikelyCandidate.item.type &&
      selectedItem === mostLikelyCandidate.item.id
  );

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
    if (!selectedTravelItem) {
      const fallbackType = type as 'location' | 'accommodation' | 'route';
      const fallbackInfo: TravelLinkInfo = {
        type: fallbackType,
        id: itemId,
        name: desc || initialValue?.name || itemId,
        tripTitle: initialValue?.tripTitle
      };

      if (fallbackType === 'accommodation' && initialValue?.locationName) {
        fallbackInfo.locationName = initialValue.locationName;
      }

      onReferenceChange(fallbackInfo);
      return;
    }

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

  const handleRetry = () => {
    setReloadToken((prev) => prev + 1);
  };

  const handleUseMostLikely = () => {
    if (!mostLikelyCandidate) {
      return;
    }

    const nextType = mostLikelyCandidate.item.type;
    const nextItemId = mostLikelyCandidate.item.id;

    setSelectedType(nextType);
    setSelectedItem(nextItemId);
    updateReference(nextType, nextItemId, description);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {loadError && (
        <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200" role="alert">
          <div className="font-medium">Unable to load travel items</div>
          <div className="mt-1">{loadError}</div>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-2 text-xs font-semibold text-red-700 hover:underline dark:text-red-200"
          >
            Retry loading
          </button>
        </div>
      )}
      {loading && (
        <div className="text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
          Loading travel items...
        </div>
      )}
      <div>
        <label htmlFor={`${id}-travel-type`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Link to Travel Item (Optional)
        </label>
        {showMostLikelyQuickLink && mostLikelyCandidate && (
          <div className="mb-2">
            <button
              type="button"
              onClick={handleUseMostLikely}
              disabled={loading || isMostLikelySelected}
              className="text-xs text-blue-700 hover:text-blue-800 hover:underline disabled:text-green-700 disabled:no-underline dark:text-blue-300 dark:hover:text-blue-200 dark:disabled:text-green-300"
            >
              {isMostLikelySelected
                ? `Most likely match selected: ${mostLikelyCandidate.item.name}`
                : `Use most likely match: ${mostLikelyCandidate.item.name} (${mostLikelyCandidate.item.type}${
                    mostLikelyCandidate.nearestDays === 0
                      ? ', matching date'
                      : `, ${mostLikelyCandidate.nearestDays} day${mostLikelyCandidate.nearestDays === 1 ? '' : 's'} away`
                  })`}
            </button>
          </div>
        )}
        <AriaSelect
          id={`${id}-travel-type`}
          value={selectedType}
          onChange={(value) => handleTypeChange(value)}
          disabled={loading}
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
          <label htmlFor={`${id}-travel-item`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {selectedType === 'accommodation' ? 'Accommodation' : 
             selectedType === 'location' ? 'Location' : 'Route'}
          </label>
          <AriaSelect
            id={`${id}-travel-item`}
            value={selectedItem}
            onChange={(value) => handleItemChange(value)}
            disabled={loading}
            options={selectOptions}
            placeholder={`Select ${selectedType}...`}
          />
        </div>
      )}

      {selectedItem && (
        <div>
          <label htmlFor={`${id}-description`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Link Description (Optional)
          </label>
          <input
            id={`${id}-description`}
            type="text"
            value={description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            disabled={loading}
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

      {travelItems.length === 0 && !loading && !loadError && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          No travel items found. Create some travel data first to link expenses.
        </div>
      )}
    </div>
  );
}
