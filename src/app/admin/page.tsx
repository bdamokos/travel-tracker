'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import TripList from './components/TripList';
import CostTrackerList from './components/CostTracking/CostTrackerList';
import { ExistingCostEntry } from '../types';

function AdminPageContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'travel' | 'cost'>('travel');
  const [tripDeleteDialog, setTripDeleteDialog] = useState<{
    isOpen: boolean;
    tripId: string;
    tripTitle: string;
    isDeleting?: boolean;
  } | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [existingCostEntries, setExistingCostEntries] = useState<ExistingCostEntry[]>([]);
  const [costTrackingLoading, setCostTrackingLoading] = useState(true);
  const router = useRouter();

  // Set active tab based on URL parameter
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'cost') {
      setActiveTab('cost');
    } else {
      setActiveTab('travel');
    }
  }, [searchParams]);

  useEffect(() => {
    // Check if we're on an admin domain
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

  const loadExistingCostEntries = async () => {
    try {
      setCostTrackingLoading(true);
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
    } finally {
      setCostTrackingLoading(false);
    }
  };

  // Load cost tracking entries when authorized
  useEffect(() => {
    if (isAuthorized) {
      loadExistingCostEntries();
    }
  }, [isAuthorized]);

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
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">
              Travel Tracker Admin
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage your travel data and track costs for your journeys.
            </p>
          </header>
          
          {/* Navigation Tabs */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg mb-6">
            <div className="border-b border-gray-200 dark:border-gray-700">
              <nav className="flex space-x-8 px-6">
                <button
                  onClick={() => {
                    setActiveTab('travel');
                    router.push('/admin');
                  }}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'travel'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  Travel Data
                </button>
                <button
                  onClick={() => {
                    setActiveTab('cost');
                    router.push('/admin?tab=cost');
                  }}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'cost'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  Cost Tracking
                </button>
              </nav>
            </div>
          </div>
          
          {/* Tab Content */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            {activeTab === 'travel' && <TripList tripDeleteDialog={tripDeleteDialog} setTripDeleteDialog={setTripDeleteDialog} />}
            {activeTab === 'cost' && (
              <CostTrackerList 
                existingCostEntries={existingCostEntries}
                loading={costTrackingLoading}
                onRefresh={loadExistingCostEntries}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <AdminPageContent />
    </Suspense>
  );
} 