'use client';

import Link from 'next/link';
import { ExistingCostEntry } from '../../../types';
import { formatCurrency, formatDate } from '../../../lib/costUtils';

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
  return (
    <div className="space-y-6">
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
            <div key={entry.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-6 shadow-xs hover:shadow-md transition-shadow">
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
