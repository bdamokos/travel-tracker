'use client';

import React, { useState } from 'react';
import { Accommodation, CostTrackingLink } from '../../types';
import { ExpenseTravelLookup } from '../../lib/expenseTravelLookup';
import { CostTrackingData } from '../../types';
import { useAccommodations } from '../../hooks/useAccommodations';
import AccommodationInput from './AccommodationInput';
import CostTrackingLinksManager from './CostTrackingLinksManager';
import LinkedExpensesDisplay from './LinkedExpensesDisplay';
import AccommodationReadOnlyDisplay from './AccommodationReadOnlyDisplay';

interface LocationAccommodationsManagerProps {
  tripId: string;
  locationId: string;
  locationName: string;
  accommodationIds: string[];
  onAccommodationIdsChange: (ids: string[]) => void;
  travelLookup: ExpenseTravelLookup | null;
  costData: CostTrackingData | null;
  displayMode?: boolean; // When true, shows read-only display without editing controls
}

export default function LocationAccommodationsManager({
  tripId,
  locationId,
  locationName,
  accommodationIds,
  onAccommodationIdsChange,
  travelLookup,
  costData,
  displayMode = false
}: LocationAccommodationsManagerProps) {
  const {
    loading,
    error,
    createAccommodation,
    updateAccommodation,
    deleteAccommodation,
    getAccommodationById
  } = useAccommodations(tripId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAccommodation, setNewAccommodation] = useState<{
    name: string;
    accommodationData: string;
    isAccommodationPublic: boolean;
    costTrackingLinks: CostTrackingLink[];
  }>({
    name: '',
    accommodationData: '',
    isAccommodationPublic: false,
    costTrackingLinks: []
  });

  // Get accommodations for this location
  const locationAccommodations = accommodationIds
    .map(id => getAccommodationById(id))
    .filter(Boolean) as Accommodation[];

  const handleAddAccommodation = async () => {
    if (!newAccommodation.name.trim()) {
      alert('Please enter an accommodation name');
      return;
    }

    try {
      const created = await createAccommodation(tripId, {
        ...newAccommodation,
        locationId
      });
      
      // Add to location's accommodation IDs
      onAccommodationIdsChange([...accommodationIds, created.id]);
      
      // Reset form
      setNewAccommodation({
        name: '',
        accommodationData: '',
        isAccommodationPublic: false,
        costTrackingLinks: []
      });
      setShowAddForm(false);
    } catch (error) {
      console.error('Error creating accommodation:', error);
    }
  };

  const handleUpdateAccommodation = async (accommodation: Accommodation) => {
    try {
      await updateAccommodation(tripId, accommodation);
      setEditingId(null);
    } catch (error) {
      console.error('Error updating accommodation:', error);
    }
  };

  const handleDeleteAccommodation = async (accommodationId: string) => {
    if (confirm('Are you sure you want to delete this accommodation?')) {
      try {
        await deleteAccommodation(tripId, accommodationId);
        // Remove from location's accommodation IDs
        onAccommodationIdsChange(accommodationIds.filter(id => id !== accommodationId));
      } catch (error) {
        console.error('Error deleting accommodation:', error);
      }
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Loading accommodations...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-500 dark:text-red-400">
        Error loading accommodations: {error}
      </div>
    );
  }

  // Display mode: show read-only accommodations without editing controls
  if (displayMode) {
    // Check for orphaned accommodation IDs (IDs that don't have corresponding accommodation data)
    const missingAccommodations = accommodationIds.filter(id => !getAccommodationById(id));
    
    return (
      <div className="space-y-3">
        {locationAccommodations.length > 0 && (
          <div>
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              🏨 Accommodations ({locationAccommodations.length})
            </div>
            {locationAccommodations.map((accommodation) => (
              <AccommodationReadOnlyDisplay
                key={accommodation.id}
                accommodation={accommodation}
                travelLookup={travelLookup}
                costData={costData}
              />
            ))}
          </div>
        )}
        
        {missingAccommodations.length > 0 && (
          <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded border border-amber-200 dark:border-amber-800">
            ⚠️ {missingAccommodations.length} accommodation{missingAccommodations.length !== 1 ? 's' : ''} need{missingAccommodations.length === 1 ? 's' : ''} migration
          </div>
        )}
        
        {locationAccommodations.length === 0 && accommodationIds.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400 italic">
            No accommodations added
          </div>
        )}
      </div>
    );
  }

  // Edit mode: show full management interface
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          🏨 Accommodations for {locationName}
        </label>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {locationAccommodations.length} accommodation{locationAccommodations.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Existing Accommodations */}
      {locationAccommodations.map((accommodation) => (
        <div key={accommodation.id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800">
          {editingId === accommodation.id ? (
            <EditAccommodationForm
              accommodation={accommodation}
              onSave={handleUpdateAccommodation}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <AccommodationDisplay
              accommodation={accommodation}
              onEdit={() => setEditingId(accommodation.id)}
              onDelete={() => handleDeleteAccommodation(accommodation.id)}
              travelLookup={travelLookup}
              costData={costData}
            />
          )}
        </div>
      ))}

      {/* Add New Accommodation */}
      {showAddForm ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-700">
          <h4 className="font-medium mb-3 text-gray-900 dark:text-gray-100">Add New Accommodation</h4>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Accommodation Name *
              </label>
              <input
                type="text"
                value={newAccommodation.name}
                onChange={(e) => setNewAccommodation(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="e.g., Hotel Mariott, Airbnb Downtown"
              />
            </div>

            <AccommodationInput
              accommodationData={newAccommodation.accommodationData}
              isAccommodationPublic={newAccommodation.isAccommodationPublic}
              onAccommodationDataChange={(data) => 
                setNewAccommodation(prev => ({ ...prev, accommodationData: data }))
              }
              onPrivacyChange={(isPublic) => 
                setNewAccommodation(prev => ({ ...prev, isAccommodationPublic: isPublic }))
              }
            />

            <CostTrackingLinksManager
              currentLinks={newAccommodation.costTrackingLinks}
              onLinksChange={(links) => 
                setNewAccommodation(prev => ({ ...prev, costTrackingLinks: links }))
              }
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddAccommodation}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Add Accommodation
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="w-full px-4 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          + Add Accommodation
        </button>
      )}
    </div>
  );
}

// Component for displaying accommodation details
function AccommodationDisplay({ 
  accommodation, 
  onEdit, 
  onDelete, 
  travelLookup,
  costData
}: {
  accommodation: Accommodation;
  onEdit: () => void;
  onDelete: () => void;
  travelLookup: ExpenseTravelLookup | null;
  costData: CostTrackingData | null;
}) {
  return (
    <div>
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-medium text-gray-900 dark:text-gray-100">{accommodation.name}</h4>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="text-blue-500 hover:text-blue-700 text-sm"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="text-red-500 hover:text-red-700 text-sm"
          >
            Delete
          </button>
        </div>
      </div>
      
      {accommodation.accommodationData && (
        <div className="text-sm text-gray-800 dark:text-gray-200 mb-2">
          <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded text-xs">
            {accommodation.accommodationData.substring(0, 100)}
            {accommodation.accommodationData.length > 100 && '...'}
          </div>
        </div>
      )}
      
      <div className="flex items-center gap-4 text-xs text-gray-700 dark:text-gray-200">
        <span>
          {accommodation.isAccommodationPublic ? '🌍 Public' : '🔒 Private'}
        </span>
        <span>
          💰 {accommodation.costTrackingLinks?.length || 0} linked expense{accommodation.costTrackingLinks?.length !== 1 ? 's' : ''}
        </span>
      </div>
      
      {/* Linked Expenses Display */}
      <LinkedExpensesDisplay
        itemId={accommodation.id}
        itemType="accommodation"
        itemName={accommodation.name}
        travelLookup={travelLookup}
        costData={costData}
      />
    </div>
  );
}

// Component for editing accommodation
function EditAccommodationForm({
  accommodation,
  onSave,
  onCancel
}: {
  accommodation: Accommodation;
  onSave: (accommodation: Accommodation) => void;
  onCancel: () => void;
}) {
  const [editData, setEditData] = useState<Accommodation>(accommodation);

  const handleSave = () => {
    if (!editData.name.trim()) {
      alert('Please enter an accommodation name');
      return;
    }
    onSave(editData);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Accommodation Name *
        </label>
        <input
          type="text"
          value={editData.name}
          onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
        />
      </div>

      <AccommodationInput
        accommodationData={editData.accommodationData || ''}
        isAccommodationPublic={editData.isAccommodationPublic || false}
        onAccommodationDataChange={(data) => 
          setEditData(prev => ({ ...prev, accommodationData: data }))
        }
        onPrivacyChange={(isPublic) => 
          setEditData(prev => ({ ...prev, isAccommodationPublic: isPublic }))
        }
      />

      <CostTrackingLinksManager
        currentLinks={editData.costTrackingLinks || []}
        onLinksChange={(links) => 
          setEditData(prev => ({ ...prev, costTrackingLinks: links }))
        }
      />

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          Save Changes
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}