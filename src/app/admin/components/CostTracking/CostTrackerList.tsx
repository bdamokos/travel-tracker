'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ExistingCostEntry } from '@/app/types';
import { formatCurrency, formatDate } from '@/app/lib/costUtils';

interface CostTrackerListProps {
  existingCostEntries: ExistingCostEntry[];
  loading: boolean;
  onRefresh: () => void;
}

export default function CostTrackerList({
  existingCostEntries,
  loading,
  onRefresh,
}: CostTrackerListProps) {
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    costId: string;
    title: string;
    isDeleting: boolean;
  } | null>(null);

  const requestDelete = (costId: string, title: string) => {
    setDeleteDialog({ isOpen: true, costId, title, isDeleting: false });
  };

  const confirmDelete = async () => {
    if (!deleteDialog) return;
    setDeleteDialog(prev => prev ? { ...prev, isDeleting: true } : null);
    try {
      const response = await fetch(`/api/cost-tracking?id=${encodeURIComponent(deleteDialog.costId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        console.error('Failed to delete cost tracker', response.status);
        setDeleteDialog(prev => prev ? { ...prev, isDeleting: false } : null);
        return;
      }
      setDeleteDialog(null);
      await onRefresh();
    } catch (error) {
      console.error('Error deleting cost tracker:', error);
      setDeleteDialog(prev => prev ? { ...prev, isDeleting: false } : null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Delete Confirmation Dialog */}
      {deleteDialog?.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.704-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Delete Cost Tracker?
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  A backup is created before deletion.
                </p>
              </div>
            </div>

            <div className="mb-6">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
                <p className="text-sm text-red-700 dark:text-red-300">
                  You are about to delete cost tracking data for <strong>&quot;{deleteDialog.title}&quot;</strong>.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteDialog(null)}
                disabled={deleteDialog.isDeleting}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteDialog.isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleteDialog.isDeleting && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                {deleteDialog.isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Cost Tracking</h2>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <Link
            href="/admin/cost-tracking/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-block"
          >
            Create New Cost Tracker
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading cost tracking data...</p>
        </div>
      ) : existingCostEntries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No cost tracking entries found.</p>
          <Link
            href="/admin/cost-tracking/new"
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-block"
          >
            Create Your First Cost Tracker
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {existingCostEntries.map((entry) => (
            <div key={entry.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-6 shadow-xs hover:shadow-md transition-shadow relative">
              <button
                onClick={() => requestDelete(entry.id, entry.tripTitle)}
                className="absolute top-3 right-3 p-1 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                title="Delete Cost Tracker"
              >
                🗑️
              </button>
              <h3 className="font-semibold text-lg mb-2">{entry.tripTitle}</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
                {formatDate(entry.tripStartDate)} - {formatDate(entry.tripEndDate)}
              </p>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-300">Budget:</span>
                  <span className="font-medium">{formatCurrency(entry.overallBudget, entry.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-300">Spent:</span>
                  <span className="font-medium">{formatCurrency(entry.totalSpent, entry.currency)}</span>
                </div>
                {entry.reservedBudget !== undefined && entry.reservedBudget > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Reserved:</span>
                    <span className="font-medium">{formatCurrency(entry.reservedBudget, entry.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-300">Remaining:</span>
                  <span className={`font-medium ${entry.remainingBudget >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(entry.remainingBudget, entry.currency)}
                  </span>
                </div>
              </div>
              
              <div className="flex gap-2 mt-4">
                <Link
                  href={`/admin/cost-tracking/${entry.id}`}
                  className="flex-1 px-3 py-2 bg-blue-500 text-white rounded-sm text-sm hover:bg-blue-600 text-center inline-block"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
