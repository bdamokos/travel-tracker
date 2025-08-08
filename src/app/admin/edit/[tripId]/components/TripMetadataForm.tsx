'use client';

import React from 'react';
import AccessibleDatePicker from '@/app/admin/components/AccessibleDatePicker';
import { Location, Transportation, CostTrackingLink } from '@/app/types';

interface TravelRoute {
  id: string;
  from: string;
  to: string;
  fromCoords: [number, number];
  toCoords: [number, number];
  transportType: Transportation['type'];
  date: Date;
  duration?: string;
  notes?: string;
  privateNotes?: string;
  costTrackingLinks?: CostTrackingLink[];
}

interface TravelData {
  id?: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  locations: Location[];
  routes: TravelRoute[];
}

interface TripMetadataFormProps {
  travelData: TravelData;
  setTravelData: React.Dispatch<React.SetStateAction<TravelData>>;
  setHasUnsavedChanges: (value: boolean) => void;
}

export default function TripMetadataForm({ 
  travelData, 
  setTravelData, 
  setHasUnsavedChanges 
}: TripMetadataFormProps) {
  return (
    <div>
      <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Journey Information</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="journey-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
          <input
            id="journey-title"
            type="text"
            value={travelData.title}
            onChange={(e) => {
              setTravelData(prev => ({ ...prev, title: e.target.value }));
              setHasUnsavedChanges(true);
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            placeholder="My Amazing Trip"
          />
        </div>
        <div>
          <label htmlFor="journey-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <input
            id="journey-description"
            type="text"
            value={travelData.description}
            onChange={(e) => {
              setTravelData(prev => ({ ...prev, description: e.target.value }));
              setHasUnsavedChanges(true);
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            placeholder="A wonderful journey across..."
          />
        </div>
        <div>
          <label htmlFor="journey-start-date" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
          <AccessibleDatePicker
            id="journey-start-date"
            value={travelData.startDate instanceof Date ? travelData.startDate : (travelData.startDate ? new Date(travelData.startDate) : null)}
            onChange={(d) => {
              if (d) {
                setTravelData(prev => ({ ...prev, startDate: d }));
                setHasUnsavedChanges(true);
              }
            }}
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="journey-end-date" className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
          <AccessibleDatePicker
            id="journey-end-date"
            value={travelData.endDate instanceof Date ? travelData.endDate : (travelData.endDate ? new Date(travelData.endDate) : null)}
            onChange={(d) => {
              if (d) {
                setTravelData(prev => ({ ...prev, endDate: d }));
                setHasUnsavedChanges(true);
              }
            }}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}