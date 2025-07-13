'use client';

import { useState, useEffect, useCallback } from 'react';
import { CostTrackingData, Expense, ExistingTrip, ExistingCostEntry } from '../../types';
import { EXPENSE_CATEGORIES } from '../../lib/costUtils';
import CostTrackerList from './CostTracking/CostTrackerList';
import CostTrackerEditor from './CostTracking/CostTrackerEditor';

export default function CostTrackingForm() {
  const [mode, setMode] = useState<'create' | 'edit' | 'list'>('list');
  const [existingTrips, setExistingTrips] = useState<ExistingTrip[]>([]);
  const [existingCostEntries, setExistingCostEntries] = useState<ExistingCostEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoSaving, setAutoSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const [costData, setCostData] = useState<CostTrackingData>({
    id: '',
    tripId: '',
    tripTitle: '',
    tripStartDate: new Date(),
    tripEndDate: new Date(),
    overallBudget: 0,
    currency: 'EUR',
    countryBudgets: [],
    expenses: [],
    customCategories: [...EXPENSE_CATEGORIES],
    createdAt: '',
  });

  const [selectedTrip, setSelectedTrip] = useState<ExistingTrip | null>(null);

  // Load existing trips and cost entries
  useEffect(() => {
    let mounted = true;
    
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadExistingTrips(), loadExistingCostEntries()]);
      if (mounted) {
        setLoading(false);
      }
    };
    
    loadData();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Silent auto-save function (no alerts, no redirects)
  const autoSaveCostData = useCallback(async () => {
    // Validation (silent)
    if (!costData.tripId || !costData.overallBudget || costData.overallBudget <= 0) {
      return false; // Invalid data, don't save
    }

    const method = mode === 'edit' ? 'PUT' : 'POST';
    const url = mode === 'edit' ? `/api/cost-tracking?id=${costData.id}` : '/api/cost-tracking';
    
    const dataToSave = mode === 'edit' ? costData : { ...costData, id: undefined };
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dataToSave),
    });
    
    return response.ok; // Return success status
  }, [costData, mode]);

  // Auto-save effect for edit mode (debounced)
  useEffect(() => {
    // Only auto-save if we're in edit mode and have made changes
    if (mode === 'edit' && costData.id && costData.tripId && costData.overallBudget > 0 && hasUnsavedChanges) {
      const timeoutId = setTimeout(async () => {
        try {
          setAutoSaving(true);
          const success = await autoSaveCostData();
          if (success) {
            setHasUnsavedChanges(false); // Mark as saved
          }
          setAutoSaving(false);
        } catch (error) {
          console.error('Auto-save failed:', error);
          setAutoSaving(false);
        }
      }, 2000); // Auto-save after 2 seconds of inactivity

      return () => clearTimeout(timeoutId);
    }
  }, [costData, mode, hasUnsavedChanges, autoSaveCostData]);

  // Track when user makes changes (but not on initial load)
  useEffect(() => {
    if (mode === 'edit' && costData.id) {
      // Set flag that we have unsaved changes
      setHasUnsavedChanges(true);
    }
  }, [costData, mode]);

  const loadExistingTrips = async () => {
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/travel-data/list`);
      if (response.ok) {
        const trips = await response.json();
        setExistingTrips(trips);
      } else {
        setExistingTrips([]); // Ensure it's always an array
      }
    } catch (error) {
      console.error('Error loading trips:', error);
    }
  };

  const loadExistingCostEntries = async () => {
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/cost-tracking/list`);
      if (response.ok) {
        const entries = await response.json();
        setExistingCostEntries(entries);
      } else {
        console.error('Error loading cost entries:', response.status);
      }
    } catch (error) {
      console.error('Error loading cost entries:', error);
    }
  };

  const loadCostEntryForEditing = async (costId: string) => {
    try {
      if (!costId) {
        console.error('Cost ID is missing');
        alert('Error: Cost ID is missing');
        return;
      }
      
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/cost-tracking?id=${costId}`);
      
      if (response.ok) {
        const data = await response.json();
        
        const migratedData = {
          ...data,
          expenses: data.expenses.map((expense: Expense) => ({
            ...expense,
            expenseType: expense.expenseType || 'actual'
          }))
        };
        
        setCostData(migratedData);
        setHasUnsavedChanges(false);
        setMode('edit');
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Error response:', response.status, errorData);
        alert(`Error loading cost entry: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error loading cost entry:', error);
      alert('Error loading cost entry');
    }
  };

  const saveCostData = async () => {
    try {
      if (!costData.tripId || !costData.overallBudget || costData.overallBudget <= 0) {
        alert('Please select a trip and set an overall budget (greater than 0) before saving.');
        return;
      }

      const method = mode === 'edit' ? 'PUT' : 'POST';
      const url = mode === 'edit' ? `/api/cost-tracking?id=${costData.id}` : '/api/cost-tracking';
      
      const dataToSave = mode === 'edit' 
        ? costData 
        : { ...costData, id: undefined };
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSave),
      });
      
      if (response.ok) {
        await response.json();
        setHasUnsavedChanges(false);
        alert('Cost tracking data saved successfully!');
        setMode('list');
        await loadExistingCostEntries();
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

  if (mode === 'list') {
    return (
      <CostTrackerList
        existingCostEntries={existingCostEntries}
        loading={loading}
        onEdit={loadCostEntryForEditing}
        onCreate={() => setMode('create')}
        onRefresh={async () => {
          setLoading(true);
          await Promise.all([loadExistingTrips(), loadExistingCostEntries()]);
          setLoading(false);
        }}
      />
    );
  }

  return (
    <CostTrackerEditor
      costData={costData}
      setCostData={setCostData}
      onSave={saveCostData}
      onCancel={() => {
        setMode('list');
        setCostData({
          id: '',
          tripId: '',
          tripTitle: '',
          tripStartDate: new Date(),
          tripEndDate: new Date(),
          overallBudget: 0,
          currency: 'EUR',
          countryBudgets: [],
          expenses: [],
          customCategories: [...EXPENSE_CATEGORIES],
          createdAt: '',
        });
        setSelectedTrip(null);
      }}
      existingTrips={existingTrips}
      selectedTrip={selectedTrip}
      setSelectedTrip={setSelectedTrip}
      mode={mode}
      autoSaving={autoSaving}
      setHasUnsavedChanges={setHasUnsavedChanges}
    />
  );
}