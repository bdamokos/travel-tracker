'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTripEditor } from './hooks/useTripEditor';
import { formatDateRange } from '@/app/lib/dateUtils';
import { formatDate } from '@/app/lib/costUtils';
import DeleteWarningDialog from '../../components/DeleteWarningDialog';
import ReassignmentDialog from '../../components/ReassignmentDialog';
import TripMetadataForm from './components/TripMetadataForm';
import LocationManager from './components/LocationManager';
import RouteManager from './components/RouteManager';
import AccommodationManager from './components/AccommodationManager';

/**
 * Render the trip editor page for creating or editing a travel map, including metadata, locations, routes, accommodations, export, and admin access checks.
 *
 * The component verifies admin access, manages editor state via the trip hook, provides UI sections for metadata, locations, routes, and accommodations, and supports exporting an LLM-friendly plain-text itinerary (including optional automatic export via URL query). It also handles dialogs for safe deletion, reassignment of linked expenses, and transient toast notifications.
 *
 * @returns A JSX element that renders the full trip editor UI and associated dialogs/notifications.
 */
export default function TripEditorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tripId = params?.tripId as string;
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const hasAutoExportedRef = useRef(false);

  // Check admin access
  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const response = await fetch('/api/admin-check');
        if (response.ok) {
          setIsAuthorized(true);
        } else {
          router.push('/maps');
        }
      } catch {
        // If we can't check, assume we're on the correct domain for dev
        setIsAuthorized(true);
      } finally {
        setLoading(false);
      }
    };

    checkAdminAccess();
  }, [router]);

  const {
    autoSaving,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    travelData,
    setTravelData,
    costData,
    travelLookup,
    currentLocation,
    setCurrentLocation,
    currentRoute,
    setCurrentRoute,
    editingLocationIndex,
    setEditingLocationIndex,
    editingRouteIndex,
    setEditingRouteIndex,
    selectedLocationForPosts,
    setSelectedLocationForPosts,
    newInstagramPost,
    setNewInstagramPost,
    newTikTokPost,
    setNewTikTokPost,
    newBlogPost,
    setNewBlogPost,
    deleteDialog,
    notification,
    setNotification,
    showNotification,
    reassignDialog,
    setReassignDialog,
    handleLocationAdded,
    handleRouteAdded,
    addInstagramPost,
    addTikTokPost,
    addBlogPost,
    deleteLocation,
    deleteRoute,
    recalculateRoutePoints,
    generateMap,
    geocodeLocation,
    calculateSmartDurations,
    cleanupExpenseLinks,
    reassignExpenseLinks,
  } = useTripEditor(tripId === 'new' ? null : tripId);

  const slugify = useCallback((value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'trip-export';
  }, []);

  const accommodationsByLocation = useMemo(() => {
    const map = new Map<string, string[]>();
    (travelData.accommodations || []).forEach(accommodation => {
      if (!accommodation.locationId) {
        return;
      }
      const existing = map.get(accommodation.locationId) || [];
      existing.push(accommodation.name);
      map.set(accommodation.locationId, existing);
    });
    return map;
  }, [travelData.accommodations]);

  const expenseTotalsByLocation = useMemo(() => {
    if (!costData || !travelLookup) {
      return null;
    }

    const accommodationLocationMap = new Map<string, string>();
    (travelData.accommodations || []).forEach(accommodation => {
      if (accommodation.locationId) {
        accommodationLocationMap.set(accommodation.id, accommodation.locationId);
      }
    });

    const trackingCurrency = costData.currency || 'USD';
    const totals: Record<string, { amount: number; currency: string; unconverted?: Record<string, number> }> = {};
    const expenses = costData.expenses || [];

    expenses.forEach(expense => {
      const link = travelLookup.getTravelLinkForExpense(expense.id);
      if (!link) {
        return;
      }

      let locationId: string | null = null;
      if (link.type === 'location') {
        locationId = link.id;
      } else if (link.type === 'accommodation') {
        locationId = accommodationLocationMap.get(link.id) || null;
      }

      if (!locationId) {
        return;
      }

      const expenseCurrency = expense.currency || trackingCurrency;
      const currentTotal = totals[locationId] || { amount: 0, currency: trackingCurrency };

      if (expense.cashTransaction?.kind === 'allocation') {
        totals[locationId] = {
          ...currentTotal,
          amount: currentTotal.amount + expense.cashTransaction.baseAmount
        };
        return;
      }

      if (expense.cashTransaction?.kind === 'source') {
        totals[locationId] = {
          ...currentTotal,
          amount: currentTotal.amount + (expense.amount || 0)
        };
        return;
      }

      if (expenseCurrency !== trackingCurrency) {
        totals[locationId] = {
          ...currentTotal,
          unconverted: {
            ...(currentTotal.unconverted || {}),
            [expenseCurrency]: (currentTotal.unconverted?.[expenseCurrency] || 0) + (expense.amount || 0)
          }
        };
        return;
      }

      totals[locationId] = {
        ...currentTotal,
        amount: currentTotal.amount + (expense.amount || 0)
      };
    });

    return totals;
  }, [costData, travelLookup, travelData.accommodations]);

  const expenseTotalsByRoute = useMemo(() => {
    if (!costData || !travelLookup) {
      return null;
    }

    const trackingCurrency = costData.currency || 'USD';
    const totals: Record<string, { amount: number; currency: string; unconverted?: Record<string, number> }> = {};
    const expenses = costData.expenses || [];

    expenses.forEach(expense => {
      const link = travelLookup.getTravelLinkForExpense(expense.id);
      if (!link || link.type !== 'route') {
        return;
      }

      const routeId = link.id;
      const expenseCurrency = expense.currency || trackingCurrency;
      const currentTotal = totals[routeId] || { amount: 0, currency: trackingCurrency };

      if (expense.cashTransaction?.kind === 'allocation') {
        totals[routeId] = {
          ...currentTotal,
          amount: currentTotal.amount + expense.cashTransaction.baseAmount
        };
        return;
      }

      if (expense.cashTransaction?.kind === 'source') {
        totals[routeId] = {
          ...currentTotal,
          amount: currentTotal.amount + (expense.amount || 0)
        };
        return;
      }

      if (expenseCurrency !== trackingCurrency) {
        totals[routeId] = {
          ...currentTotal,
          unconverted: {
            ...(currentTotal.unconverted || {}),
            [expenseCurrency]: (currentTotal.unconverted?.[expenseCurrency] || 0) + (expense.amount || 0)
          }
        };
        return;
      }

      totals[routeId] = {
        ...currentTotal,
        amount: currentTotal.amount + (expense.amount || 0)
      };
    });

    return totals;
  }, [costData, travelLookup]);

  const collapseText = useCallback((text?: string) => {
    if (!text) {
      return '';
    }
    return text.replace(/\s+/g, ' ').trim();
  }, []);

  const buildExportText = useCallback(() => {
    const lines: string[] = [];
    const tripTitle = travelData.title?.trim() || 'Untitled trip';
    const tripDates = formatDateRange(travelData.startDate, travelData.endDate);

    lines.push(`Trip: ${tripTitle}`);
    if (tripDates) {
      lines.push(`Dates: ${tripDates}`);
    }
    if (travelData.description) {
      lines.push(`Description: ${collapseText(travelData.description)}`);
    }

    if (costData) {
      const trackingCurrency = costData.currency || 'USD';
      const budget = costData.overallBudget || 0;
      const expenses = costData.expenses || [];
      const totals = expenses.reduce<{ tracking: number; unconverted: Record<string, number> }>((acc, expense) => {
        const expenseCurrency = expense.currency || trackingCurrency;

        if (expense.cashTransaction?.kind === 'allocation') {
          acc.tracking += expense.cashTransaction.baseAmount;
          return acc;
        }

        if (expense.cashTransaction?.kind === 'source') {
          acc.tracking += expense.amount || 0;
          return acc;
        }

        if (expenseCurrency !== trackingCurrency) {
          acc.unconverted[expenseCurrency] = (acc.unconverted[expenseCurrency] || 0) + (expense.amount || 0);
          return acc;
        }

        acc.tracking += expense.amount || 0;
        return acc;
      }, { tracking: 0, unconverted: {} });

      const remaining = budget - totals.tracking;
      const unconvertedParts = Object.entries(totals.unconverted)
        .filter(([code, amount]) => code && Math.abs(amount) > 0.000001)
        .map(([code, amount]) => `${amount.toFixed(2)} ${code}`);

      lines.push(`Cost: Budget ${budget.toFixed(2)} ${trackingCurrency}, Spent ${totals.tracking.toFixed(2)} ${trackingCurrency}, Remaining ${remaining.toFixed(2)} ${trackingCurrency}`);
      if (unconvertedParts.length > 0) {
        lines.push(`Cost (unconverted): ${unconvertedParts.join(', ')}`);
      }
    }
    lines.push('');

    const sortedLocations = [...travelData.locations].sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      return aTime - bTime;
    });

    lines.push('Locations:');
    if (sortedLocations.length === 0) {
      lines.push('No locations added yet.');
    } else {
      sortedLocations.forEach((location, index) => {
        const dateRange = formatDateRange(location.date, location.endDate);
        const locationLineParts = [`${index + 1}. ${location.name || 'Unnamed location'}`];
        if (dateRange) {
          locationLineParts.push(`(${dateRange})`);
        }
        lines.push(locationLineParts.join(' '));

        const accommodationNames = accommodationsByLocation.get(location.id) || [];
        if (accommodationNames.length > 0) {
          lines.push(`   - Accommodations: ${accommodationNames.join('; ')}`);
        } else if (location.accommodationData) {
          lines.push(`   - Accommodation: ${collapseText(location.accommodationData)}`);
        }

        if (location.notes) {
          lines.push(`   - Notes: ${collapseText(location.notes)}`);
        }

        const spend = expenseTotalsByLocation?.[location.id];
        if (spend) {
          const currency = spend.currency || costData?.currency || '';
          const hasTrackingAmount = Math.abs(spend.amount) > 0.000001;
          const unconvertedParts = spend.unconverted
            ? Object.entries(spend.unconverted)
              .filter(([code, amount]) => code && Math.abs(amount) > 0.000001)
              .map(([code, amount]) => `${amount.toFixed(2)} ${code}`)
            : [];

          if (hasTrackingAmount) {
            const suffix = unconvertedParts.length > 0 ? ` (plus unconverted: ${unconvertedParts.join(', ')})` : '';
            lines.push(`   - Linked spend: ${spend.amount.toFixed(2)} ${currency}${suffix}`.trim());
          } else if (unconvertedParts.length > 0) {
            lines.push(`   - Linked spend (unconverted): ${unconvertedParts.join(', ')}`.trim());
          }
        }

        if (location.arrivalTime || location.departureTime) {
          const startDay = location.date ? new Date(location.date).toISOString().split('T')[0] : '';
          const endDay = location.endDate ? new Date(location.endDate).toISOString().split('T')[0] : startDay;
          const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
          const isTimeOfDay = (value: string) => value.includes(':');

          const arrivalValue = location.arrivalTime || '';
          const departureValue = location.departureTime || '';
          const arrivalIsRedundantDate = arrivalValue && isDateOnly(arrivalValue) && arrivalValue === startDay;
          const departureIsRedundantDate = departureValue && isDateOnly(departureValue) && departureValue === endDay;

          const timing = [
            arrivalValue && (isTimeOfDay(arrivalValue) || (!isDateOnly(arrivalValue) && !arrivalIsRedundantDate))
              ? `arrive ${arrivalValue}`
              : null,
            departureValue && (isTimeOfDay(departureValue) || (!isDateOnly(departureValue) && !departureIsRedundantDate))
              ? `depart ${departureValue}`
              : null
          ].filter(Boolean).join(' / ');
          if (timing) {
            lines.push(`   - Timing: ${timing}`);
          }
        }
      });
    }

    lines.push('');
    const sortedRoutes = [...travelData.routes].sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      return aTime - bTime;
    });

    lines.push('Routes:');
    if (sortedRoutes.length === 0) {
      lines.push('No routes added yet.');
    } else {
      sortedRoutes.forEach(route => {
        const formattedRouteDate = formatDate(route.date);
        const routeDate = formattedRouteDate === 'Invalid Date' ? '' : formattedRouteDate;
        const duration = route.duration ? `, ${route.duration}` : '';
        const notes = route.notes ? ` — ${collapseText(route.notes)}` : '';
        lines.push(`${routeDate || 'Date TBD'}: ${route.from || 'Unknown'} → ${route.to || 'Unknown'} (${route.transportType}${duration})${notes}`);

        const spend = expenseTotalsByRoute?.[route.id];
        if (spend) {
          const currency = spend.currency || costData?.currency || '';
          const hasTrackingAmount = Math.abs(spend.amount) > 0.000001;
          const unconvertedParts = spend.unconverted
            ? Object.entries(spend.unconverted)
              .filter(([code, amount]) => code && Math.abs(amount) > 0.000001)
              .map(([code, amount]) => `${amount.toFixed(2)} ${code}`)
            : [];

          if (hasTrackingAmount) {
            const suffix = unconvertedParts.length > 0 ? ` (plus unconverted: ${unconvertedParts.join(', ')})` : '';
            lines.push(`   - Linked spend: ${spend.amount.toFixed(2)} ${currency}${suffix}`.trim());
          } else if (unconvertedParts.length > 0) {
            lines.push(`   - Linked spend (unconverted): ${unconvertedParts.join(', ')}`.trim());
          }
        }
      });
    }

    return lines.join('\n');
  }, [
    accommodationsByLocation,
    collapseText,
    costData,
    expenseTotalsByLocation,
    expenseTotalsByRoute,
    travelData.description,
    travelData.endDate,
    travelData.locations,
    travelData.routes,
    travelData.startDate,
    travelData.title
  ]);

  const handleExportText = useCallback(() => {
    if (travelData.locations.length === 0 && travelData.routes.length === 0) {
      showNotification('Add some travel details before exporting.', 'error');
      return;
    }

    try {
      setIsExporting(true);
      const content = buildExportText();
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${slugify(travelData.title || 'trip')}-itinerary.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotification('Itinerary exported as text.', 'success');
    } catch (error) {
      console.error('Failed to export itinerary text', error);
      showNotification('Failed to export itinerary text.', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [buildExportText, showNotification, slugify, travelData.routes.length, travelData.title, travelData.locations.length]);

  const exportQuery = searchParams?.get('exportText');

  useEffect(() => {
    const shouldAutoExport = exportQuery === '1' || exportQuery === 'true' || exportQuery === 'txt';
    if (!shouldAutoExport || hasAutoExportedRef.current || loading || !isAuthorized) {
      return;
    }

    if (tripId === 'new') {
      return;
    }

    if (travelData.locations.length === 0 && travelData.routes.length === 0) {
      return;
    }

    hasAutoExportedRef.current = true;
    handleExportText();
  }, [exportQuery, handleExportText, isAuthorized, loading, travelData.locations.length, travelData.routes.length, tripId]);

  // Toast Notification Component
  const ToastNotification: React.FC<{
    notification: { message: string; type: 'success' | 'error' | 'info'; isVisible: boolean };
    onClose: () => void;
  }> = ({ notification, onClose }) => (
    <div className={`fixed top-4 right-4 z-50 transition-all duration-300 transform ${notification.isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}>
      <div className={`max-w-sm w-full shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden ${notification.type === 'success' ? 'bg-green-50 dark:bg-green-900' :
        notification.type === 'error' ? 'bg-red-50 dark:bg-red-900' :
          'bg-blue-50 dark:bg-blue-900'
        }`}>
        <div className="p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              {notification.type === 'success' && (
                <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {notification.type === 'error' && (
                <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {notification.type === 'info' && (
                <svg className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <div className="ml-3 w-0 flex-1 pt-0.5">
              <p className={`text-sm font-medium ${notification.type === 'success' ? 'text-green-800 dark:text-green-200' :
                notification.type === 'error' ? 'text-red-800 dark:text-red-200' :
                  'text-blue-800 dark:text-blue-200'
                }`}>
                {notification.message}
              </p>
            </div>
            <div className="ml-4 flex-shrink-0 flex">
              <button
                onClick={onClose}
                className={`rounded-md inline-flex focus:outline-none focus:ring-2 focus:ring-offset-2 ${notification.type === 'success' ? 'text-green-500 hover:text-green-600 focus:ring-green-500' :
                  notification.type === 'error' ? 'text-red-500 hover:text-red-600 focus:ring-red-500' :
                    'text-blue-500 hover:text-blue-600 focus:ring-blue-500'
                  }`}
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading admin interface...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/admin')}
                className="px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                ← Back to List
              </button>
              <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
                {tripId === 'new' ? 'Create New Travel Map' : 'Edit Travel Map'}
              </h1>
              {autoSaving && (
                <div className="flex items-center gap-2 text-blue-600">
                  <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm">Auto-saving...</span>
                </div>
              )}
              {!autoSaving && hasUnsavedChanges && (
                <div className="flex items-center gap-2 text-amber-600">
                  <div className="w-2 h-2 bg-amber-600 rounded-full"></div>
                  <span className="text-sm">Unsaved changes</span>
                </div>
              )}
              {!autoSaving && !hasUnsavedChanges && (tripId !== 'new' || travelData.id) && (
                <div className="flex items-center gap-2 text-green-600">
                  <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                  <span className="text-sm">All changes saved</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExportText}
                disabled={isExporting}
                className={`px-4 py-2 rounded-md text-white transition-colors ${isExporting ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                title="Quickly download an LLM-friendly text summary. Add ?exportText=1 to the URL to auto-download."
              >
                {isExporting ? 'Preparing export…' : 'Export LLM text'}
              </button>
            </div>
          </div>

          {/* Main Editor Content - Broken down into smaller components */}
          <div className="space-y-8">
            {/* Basic Info */}
            <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <TripMetadataForm
                travelData={travelData}
                setTravelData={setTravelData}
                setHasUnsavedChanges={setHasUnsavedChanges}
              />
            </section>

            {/* Locations */}
            <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <LocationManager
                tripId={tripId}
                travelData={travelData}
                setTravelData={setTravelData}
                setHasUnsavedChanges={setHasUnsavedChanges}
                currentLocation={currentLocation}
                setCurrentLocation={setCurrentLocation}
                editingLocationIndex={editingLocationIndex}
                setEditingLocationIndex={setEditingLocationIndex}
                selectedLocationForPosts={selectedLocationForPosts}
                setSelectedLocationForPosts={setSelectedLocationForPosts}
                newInstagramPost={newInstagramPost}
                setNewInstagramPost={setNewInstagramPost}
                newTikTokPost={newTikTokPost}
                setNewTikTokPost={setNewTikTokPost}
                newBlogPost={newBlogPost}
                setNewBlogPost={setNewBlogPost}
                travelLookup={travelLookup}
                costData={costData}
                handleLocationAdded={handleLocationAdded}
                geocodeLocation={geocodeLocation}
                deleteLocation={deleteLocation}
                addInstagramPost={addInstagramPost}
                addTikTokPost={addTikTokPost}
                addBlogPost={addBlogPost}
                calculateSmartDurations={calculateSmartDurations}
              />
            </section>

            {/* Routes */}
            <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <RouteManager
                travelData={travelData}
                setTravelData={setTravelData}
                setHasUnsavedChanges={setHasUnsavedChanges}
                currentRoute={currentRoute}
                setCurrentRoute={setCurrentRoute}
                editingRouteIndex={editingRouteIndex}
                setEditingRouteIndex={setEditingRouteIndex}
                handleRouteAdded={handleRouteAdded}
                geocodeLocation={geocodeLocation}
                deleteRoute={deleteRoute}
                recalculateRoutePoints={recalculateRoutePoints}
                generateMap={generateMap}
                tripId={tripId}
              />
            </section>

            {/* Accommodations */}
            <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <AccommodationManager
                travelData={travelData}
                setTravelData={setTravelData}
                setHasUnsavedChanges={setHasUnsavedChanges}
                travelLookup={travelLookup}
                costData={costData}
              />
            </section>
          </div>

          {/* Safe Deletion Dialogs - Moved from TravelDataForm.tsx */}
          {deleteDialog && (
            <DeleteWarningDialog
              isOpen={deleteDialog.isOpen}
              itemType={deleteDialog.itemType}
              itemName={deleteDialog.itemName}
              linkedExpenses={deleteDialog.linkedExpenses}
              onChoice={async (choice) => {
                if (choice === 'cancel') {
                  // Handle this with the hook's logic
                } else if (choice === 'remove') {
                  // Remove links and delete item
                  await cleanupExpenseLinks(deleteDialog.itemType, deleteDialog.itemId);

                  if (deleteDialog.itemType === 'location') {
                    setTravelData(prev => ({
                      ...prev,
                      locations: prev.locations.filter((_, i) => i !== deleteDialog.itemIndex)
                    }));
                  } else {
                    setTravelData(prev => ({
                      ...prev,
                      routes: prev.routes.filter((_, i) => i !== deleteDialog.itemIndex)
                    }));
                  }

                  setHasUnsavedChanges(true);
                } else if (choice === 'reassign') {
                  // Show reassignment dialog
                  const availableItems = deleteDialog.itemType === 'location'
                    ? travelData.locations
                      .filter(loc => loc.id !== deleteDialog.itemId)
                      .map(loc => ({ id: loc.id, name: loc.name }))
                    : travelData.routes
                      .filter(route => route.id !== deleteDialog.itemId)
                      .map(route => ({ id: route.id, name: `${route.from} → ${route.to}` }));

                  setReassignDialog({
                    isOpen: true,
                    itemType: deleteDialog.itemType,
                    fromItemId: deleteDialog.itemId,
                    fromItemName: deleteDialog.itemName,
                    linkedExpenses: deleteDialog.linkedExpenses,
                    availableItems,
                    onComplete: () => {
                      // Delete the item after reassignment
                      if (deleteDialog.itemType === 'location') {
                        setTravelData(prev => ({
                          ...prev,
                          locations: prev.locations.filter((_, i) => i !== deleteDialog.itemIndex)
                        }));
                      } else {
                        setTravelData(prev => ({
                          ...prev,
                          routes: prev.routes.filter((_, i) => i !== deleteDialog.itemIndex)
                        }));
                      }

                      setHasUnsavedChanges(true);
                    }
                  });
                }
              }}
            />
          )}

          {reassignDialog && (
            <ReassignmentDialog
              isOpen={reassignDialog.isOpen}
              itemType={reassignDialog.itemType}
              fromItemName={reassignDialog.fromItemName}
              linkedExpenses={reassignDialog.linkedExpenses}
              availableItems={reassignDialog.availableItems}
              onReassign={async (toItemId, toItemName) => {
                // Reassign the expense links
                await reassignExpenseLinks(
                  reassignDialog.itemType,
                  reassignDialog.fromItemId,
                  reassignDialog.itemType,
                  toItemId,
                  toItemName
                );

                setReassignDialog(null);
                reassignDialog.onComplete();
              }}
              onCancel={() => {
                setReassignDialog(null);
              }}
            />
          )}

          {/* Toast Notification - Moved from TravelDataForm.tsx */}
          {notification && (
            <ToastNotification
              notification={notification}
              onClose={() => {
                setNotification(prev => prev ? { ...prev, isVisible: false } : null);
                setTimeout(() => setNotification(null), 300);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
