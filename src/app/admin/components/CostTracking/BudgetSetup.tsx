'use client';

import { CostTrackingData, ExistingTrip } from '@/app/types';
import { formatDate } from '@/app/lib/costUtils';
import AriaSelect from '@/app/admin/components/AriaSelect';
import { getTodayLocalDay, parseDateAsLocalDay } from '@/app/lib/localDateUtils';

interface BudgetSetupProps {
  costData: CostTrackingData;
  setCostData: React.Dispatch<React.SetStateAction<CostTrackingData>>;
  existingTrips: ExistingTrip[];
  selectedTrip: ExistingTrip | null;
  setSelectedTrip: React.Dispatch<React.SetStateAction<ExistingTrip | null>>;
  mode: 'create' | 'edit';
}

export default function BudgetSetup({
  costData,
  setCostData,
  existingTrips,
  selectedTrip,
  setSelectedTrip,
  mode,
}: BudgetSetupProps) {
  const handleTripSelection = (trip: ExistingTrip) => {
    setSelectedTrip(trip);
    setCostData(prev => ({
      ...prev,
      tripId: trip.id,
      tripTitle: trip.title,
      tripStartDate: parseDateAsLocalDay(trip.startDate) || getTodayLocalDay(),
      tripEndDate: parseDateAsLocalDay(trip.endDate) || getTodayLocalDay()
    }));
  };

  return (
    <section aria-labelledby="tracker-settings-heading">
      <h3 id="tracker-settings-heading" className="mb-4 text-xl font-semibold">Tracker settings</h3>
	      {mode === 'create' && !selectedTrip && (
	        <div className="mb-4">
	          <h4 className="text-lg font-medium mb-2">Select a Trip</h4>
	          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
	            {existingTrips.map((trip) => (
	              <button
	                key={trip.id}
	                type="button"
	                className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500"
	                onClick={() => handleTripSelection(trip)}
	              >
	                <h4 className="font-semibold">{trip.title}</h4>
	                <p className="text-sm text-gray-500 dark:text-gray-400">{trip.description}</p>
	                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
	                  {formatDate(trip.startDate)} - {formatDate(trip.endDate)}
	                </p>
	              </button>
	            ))}
	          </div>
	        </div>
	      )}

      {(selectedTrip || mode === 'edit') && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="overall-budget" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total budget</label>
              <input
                id="overall-budget"
                type="number"
                value={costData.overallBudget || ''}
                onChange={(e) => setCostData(prev => ({ ...prev, overallBudget: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="5000"
              />
            </div>
            <div>
              <label htmlFor="reserved-budget" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reserved</label>
              <input
                id="reserved-budget"
                type="number"
                value={costData.reservedBudget ?? ''}
                onChange={(e) => {
                  const nextValue = e.target.value;

                  if (nextValue === '') {
                    setCostData(prev => ({
                      ...prev,
                      reservedBudget: undefined
                    }));
                    return;
                  }

                  const parsedValue = Number(nextValue);
                  if (Number.isNaN(parsedValue)) {
                    return;
                  }

                  setCostData(prev => ({
                    ...prev,
                    reservedBudget: Math.max(
                      0,
                      Math.min(prev.overallBudget || 0, parsedValue)
                    )
                  }));
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="1000"
                max={costData.overallBudget || undefined}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Excluded from planning calculations.
              </p>
            </div>
            <div>
              <label htmlFor="currency-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Currency</label>
              <AriaSelect
                id="currency-select"
                value={costData.currency}
                onChange={(value) => setCostData(prev => ({ ...prev, currency: value }))}
                options={[
                  { value: 'EUR', label: 'EUR' },
                  { value: 'USD', label: 'USD' },
                  { value: 'GBP', label: 'GBP' },
                  { value: 'CAD', label: 'CAD' },
                  { value: 'AUD', label: 'AUD' }
                ]}
                placeholder="Select Currency"
              />
            </div>
            <div>
              <label htmlFor="trip-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Trip</label>
              <input
                id="trip-title"
                type="text"
                value={costData.tripTitle}
                disabled
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
