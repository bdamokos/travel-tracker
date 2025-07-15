'use client';

import React, { useState } from 'react';
import YnabImportForm from '../YnabImportForm';
import { CostTrackingData } from '../../../types';

const mockCostData: CostTrackingData = {
  id: 'demo-cost-id',
  tripId: 'demo-trip-id',
  tripTitle: 'Demo Trip',
  tripStartDate: new Date('2024-01-01'),
  tripEndDate: new Date('2024-01-10'),
  overallBudget: 1000,
  currency: 'EUR',
  countryBudgets: [
    {
      id: 'budget-1',
      country: 'France',
      amount: 500,
      currency: 'EUR',
      notes: ''
    },
    {
      id: 'budget-2',
      country: 'Spain',
      amount: 300,
      currency: 'EUR',
      notes: ''
    }
  ],
  expenses: [],
  customCategories: ['Food', 'Transport', 'Accommodation', 'Entertainment'],
  createdAt: '2024-01-01T00:00:00Z'
};

export default function YnabImportFormDemo() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleImportComplete = () => {
    console.log('Import completed successfully!');
    setIsModalOpen(false);
  };

  const handleClose = () => {
    console.log('Modal closed');
    setIsModalOpen(false);
  };

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">YnabImportForm Demo</h1>
      
      <div className="space-y-4">
        <p>This demo shows the YnabImportForm component using the AccessibleModal.</p>
        
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Features to Test:</h2>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Modal opens and closes properly</li>
            <li>Escape key closes the modal</li>
            <li>Backdrop click closes the modal</li>
            <li>Focus is trapped within the modal</li>
            <li>Close button is accessible via keyboard</li>
            <li>All existing YNAB import functionality is preserved</li>
          </ul>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Open YNAB Import Modal
        </button>

        <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded">
          <h3 className="font-semibold mb-2">Test Instructions:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Click "Open YNAB Import Modal" to open the modal</li>
            <li>Try pressing Escape to close the modal</li>
            <li>Try clicking outside the modal to close it</li>
            <li>Use Tab to navigate through the modal elements</li>
            <li>Verify the close button (×) works</li>
            <li>Check that the modal shows the correct step title</li>
            <li>Verify all form elements are accessible</li>
          </ol>
        </div>
      </div>

      <YnabImportForm
        isOpen={isModalOpen}
        costData={mockCostData}
        onImportComplete={handleImportComplete}
        onClose={handleClose}
      />
    </div>
  );
}