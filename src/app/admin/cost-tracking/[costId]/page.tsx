'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { CostTrackingData, ExistingTrip } from '@/app/types';
import { EXPENSE_CATEGORIES } from '@/app/lib/costUtils';
import CostTrackerEditor from '@/app/admin/components/CostTracking/CostTrackerEditor';
import { getTodayLocalDay } from '@/app/lib/localDateUtils';
import { createCostDataDelta, isCostDataDeltaEmpty, snapshotCostData } from '@/app/lib/costDataDelta';

export default function CostTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const costId = params?.costId as string;
  const isNewCostTracker = costId === 'new';
  
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [existingTrips, setExistingTrips] = useState<ExistingTrip[]>([]);
  const [autoSaving, setAutoSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const [costData, setCostData] = useState<CostTrackingData>({
    id: '',
    tripId: '',
    tripTitle: '',
    tripStartDate: getTodayLocalDay(),
    tripEndDate: getTodayLocalDay(),
    overallBudget: 0,
    reservedBudget: 0,
    currency: 'EUR',
    countryBudgets: [],
    expenses: [],
    customCategories: [...EXPENSE_CATEGORIES],
    createdAt: '',
  });

  const [selectedTrip, setSelectedTrip] = useState<ExistingTrip | null>(null);
  const lastSavedCostDataRef = useRef<CostTrackingData | null>(null);

  // Check admin access
  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const response = await fetch('/api/admin-check', { cache: 'no-store' });
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

  // Load existing trips
  useEffect(() => {
    const loadExistingTrips = async () => {
      try {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/travel-data/list`, { cache: 'no-store' });
        if (response.ok) {
          const trips = await response.json();
          setExistingTrips(trips);
        } else {
          setExistingTrips([]);
        }
      } catch (error) {
        console.error('Error loading trips:', error);
      }
    };

    if (isAuthorized) {
      loadExistingTrips();
    }
  }, [isAuthorized]);

  // Function to load cost tracking data
  const loadCostData = useCallback(async () => {
    if (!isNewCostTracker && costId && isAuthorized) {
      try {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/cost-tracking?id=${costId}`, { cache: 'no-store' });
        
        if (response.ok) {
          const data = await response.json();
          
          const migratedData = {
            ...data,
            reservedBudget: data.reservedBudget ?? 0,
            expenses: data.expenses.map((expense: { expenseType?: string; [key: string]: unknown }) => ({
              ...expense,
              expenseType: expense.expenseType || 'actual'
            }))
          };
          
          setCostData(migratedData);
          lastSavedCostDataRef.current = snapshotCostData(migratedData);
          setHasUnsavedChanges(false);
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Error response:', response.status, errorData);
          alert(`Error loading cost entry: ${errorData.error || 'Unknown error'}`);
          router.push('/admin');
        }
      } catch (error) {
        console.error('Error loading cost entry:', error);
        alert('Error loading cost entry');
        router.push('/admin');
      }
    }
  }, [costId, isNewCostTracker, isAuthorized, router]);

  // Load cost tracking data if editing existing
  useEffect(() => {
    loadCostData();
  }, [loadCostData]);

  // Auto-save function for existing cost trackers
  const autoSaveCostData = useCallback(async () => {
    if (isNewCostTracker) return false;
    
    // Validation (silent)
    if (!costData.tripId || !costData.overallBudget || costData.overallBudget <= 0) {
      return false;
    }

    const saveFullCostData = async (): Promise<boolean> => {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/cost-tracking?id=${costData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(costData),
      });

      if (!response.ok) {
        let errorDetails = '';
        try {
          errorDetails = await response.text();
        } catch {
          errorDetails = '';
        }
        console.error('Auto-save (full) failed:', response.status, errorDetails);
        return false;
      }

      return true;
    };

    const saveDeltaCostData = async (): Promise<boolean> => {
      if (!lastSavedCostDataRef.current) {
        return false;
      }

      const delta = createCostDataDelta(lastSavedCostDataRef.current, costData);
      if (!delta || isCostDataDeltaEmpty(delta)) {
        return true;
      }

      try {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/cost-tracking?id=${costData.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ deltaUpdate: delta }),
        });

        if (!response.ok) {
          let errorDetails = '';
          try {
            errorDetails = await response.text();
          } catch {
            errorDetails = '';
          }
          console.warn('Auto-save (delta) failed, will fallback to full save:', response.status, errorDetails);
          return false;
        }

        return true;
      } catch (error) {
        console.warn('Auto-save (delta) error, will fallback to full save:', error);
        return false;
      }
    };

    const deltaSaved = await saveDeltaCostData();
    if (deltaSaved) {
      lastSavedCostDataRef.current = snapshotCostData(costData);
      return true;
    }

    const fullSaved = await saveFullCostData();
    if (fullSaved) {
      lastSavedCostDataRef.current = snapshotCostData(costData);
    }
    return fullSaved;
  }, [costData, isNewCostTracker]);

  // Auto-save effect for edit mode
  useEffect(() => {
    if (!isNewCostTracker && costData.id && costData.tripId && costData.overallBudget > 0 && hasUnsavedChanges) {
      const timeoutId = setTimeout(async () => {
        try {
          setAutoSaving(true);
          const success = await autoSaveCostData();
          if (success) {
            setHasUnsavedChanges(false);
          }
          setAutoSaving(false);
        } catch (error) {
          console.error('Auto-save failed:', error);
          setAutoSaving(false);
        }
      }, 2000);

      return () => clearTimeout(timeoutId);
    }
    // Return undefined cleanup function for other code paths
    return undefined;
  }, [costData, hasUnsavedChanges, isNewCostTracker, autoSaveCostData]);

  // Track when user makes changes
  useEffect(() => {
    if (!isNewCostTracker && costData.id) {
      setHasUnsavedChanges(true);
    }
  }, [costData, isNewCostTracker]);

  const saveCostData = async () => {
    try {
      if (!costData.tripId || !costData.overallBudget || costData.overallBudget <= 0) {
        alert('Please select a trip and set an overall budget (greater than 0) before saving.');
        return;
      }

      const method = isNewCostTracker ? 'POST' : 'PUT';
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const url = isNewCostTracker ? `${baseUrl}/api/cost-tracking` : `${baseUrl}/api/cost-tracking?id=${costData.id}`;
      
      const dataToSave = isNewCostTracker 
        ? { ...costData, id: undefined }
        : costData;
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSave),
      });
      
      if (response.ok) {
        const savedData = await response.json();
        setHasUnsavedChanges(false);
        lastSavedCostDataRef.current = snapshotCostData(costData);
        alert('Cost tracking data saved successfully!');
        
        if (isNewCostTracker) {
          // Redirect to the new cost tracker's URL
          router.push(`/admin/cost-tracking/${savedData.id}`);
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Save error:', response.status, errorData);
        alert(`Error saving cost tracking data: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert(`Error saving cost tracking data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCancel = () => {
    router.push('/admin?tab=cost');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">Checking authorization...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="container mx-auto px-4 py-6">
        <div className="space-y-8 text-gray-900 dark:text-gray-100">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">
              {isNewCostTracker ? 'Create New Cost Tracker' : 'Edit Cost Tracker'}
            </h1>
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              ← Back to Cost Tracking
            </button>
          </div>

          <CostTrackerEditor
            costData={costData}
            setCostData={setCostData}
            onSave={saveCostData}
            existingTrips={existingTrips}
            selectedTrip={selectedTrip}
            setSelectedTrip={setSelectedTrip}
            mode={isNewCostTracker ? 'create' : 'edit'}
            autoSaving={autoSaving}
            setHasUnsavedChanges={setHasUnsavedChanges}
            onRefreshData={loadCostData}
          />
        </div>
      </div>
    </div>
  );
}
