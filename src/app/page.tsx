'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useJourney } from './hooks/useJourney';
import { useServiceWorker } from './hooks/useServiceWorker';
import * as storageService from './services/storage';
import Timeline from './components/Timeline';
import StatusBar from './components/StatusBar';
import EditForm from './components/EditForm';
import { JourneyDay } from './types';

// Dynamic import for Map component to avoid SSR issues with Leaflet
const Map = dynamic(() => import('./components/Map'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-gray-100">
      <p className="text-gray-500">Loading map...</p>
    </div>
  ),
});

export default function Home() {
  const [selectedDayId, setSelectedDayId] = useState<string | undefined>();
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingDay, setEditingDay] = useState<JourneyDay | undefined>();
  const [pendingSyncs, setPendingSyncs] = useState(0);
  
  const { 
    journey, 
    loading, 
    error, 
    isOnline,
    createJourney,
    addDay,
    updateDay,
    syncWithServer,
  } = useJourney();
  
  const { updateAvailable, updateServiceWorker } = useServiceWorker();
  
  // Check for pending uploads
  useEffect(() => {
    const checkPendingUploads = async () => {
      const pendingUploads = await storageService.getPendingUploads();
      setPendingSyncs(pendingUploads.length);
    };
    
    checkPendingUploads();
    
    // Set up an interval to check for pending uploads
    const interval = setInterval(checkPendingUploads, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  // Handle synchronization with the server
  const handleSync = async () => {
    try {
      const syncedCount = await syncWithServer();
      setPendingSyncs(0);
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };
  
  // Create a new journey (for demonstration purposes)
  const handleCreateJourney = async () => {
    try {
      await createJourney({
        title: 'My Travel Journey',
        startDate: new Date().toISOString().split('T')[0],
      });
    } catch (error) {
      console.error('Failed to create journey:', error);
    }
  };
  
  // Handle day selection
  const handleDaySelect = (dayId: string) => {
    setSelectedDayId(dayId);
  };
  
  // Open the edit form to add a new day
  const handleAddDay = () => {
    setEditingDay(undefined);
    setShowEditForm(true);
  };
  
  // Open the edit form to edit an existing day
  const handleEditDay = (day: JourneyDay) => {
    setEditingDay(day);
    setShowEditForm(true);
  };
  
  // Save a day (add new or update existing)
  const handleSaveDay = async (dayData: Partial<JourneyDay>) => {
    try {
      if (editingDay) {
        // Update existing day
        await updateDay(editingDay.id, dayData);
      } else {
        // Add new day
        await addDay(dayData);
      }
      setShowEditForm(false);
    } catch (error) {
      console.error('Failed to save day:', error);
    }
  };
  
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button 
            onClick={handleCreateJourney}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Create New Journey
          </button>
        </div>
      </div>
    );
  }
  
  if (!journey) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">No journey found. Create your first journey to get started!</p>
          <button 
            onClick={handleCreateJourney}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Create New Journey
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b p-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Travel Tracker</h1>
          <div>
            <button 
              onClick={handleAddDay}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 mr-2"
            >
              Add New Day
            </button>
            {updateAvailable && (
              <button 
                onClick={updateServiceWorker}
                className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600"
              >
                Update Available
              </button>
            )}
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left side - Map */}
        <div className="w-2/3 h-full">
          <Map 
            journey={journey} 
            selectedDayId={selectedDayId}
          />
        </div>
        
        {/* Right side - Timeline */}
        <div className="w-1/3 border-l">
          <Timeline 
            journey={journey}
            selectedDayId={selectedDayId}
            onDaySelect={handleDaySelect}
          />
        </div>
      </div>
      
      {/* Status bar */}
      <StatusBar 
        isOnline={isOnline}
        lastSynced={journey.lastSynced}
        pendingSyncs={pendingSyncs}
        syncStatus={journey.syncStatus}
        onSync={handleSync}
      />
      
      {/* Edit form modal */}
      {showEditForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <EditForm 
            day={editingDay}
            onSave={handleSaveDay}
            onCancel={() => setShowEditForm(false)}
          />
        </div>
      )}
    </main>
  );
} 