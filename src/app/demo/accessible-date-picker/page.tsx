'use client';

import React, { useState } from 'react';
import AccessibleDatePicker from '../../admin/components/AccessibleDatePicker';

export default function AccessibleDatePickerDemo() {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [requiredDate, setRequiredDate] = useState<Date | null>(new Date());
  const [constrainedDate, setConstrainedDate] = useState<Date | null>(null);
  const [formData, setFormData] = useState<{ [key: string]: string }>({});

  // Consistent date formatting function to avoid hydration issues
  const formatDate = (date: Date | null): string => {
    if (!date) return 'None';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Date constraints for testing
  const minDate = new Date();
  minDate.setDate(minDate.getDate() - 30); // 30 days ago
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 30); // 30 days from now

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formDataObj = new FormData(e.currentTarget);
    const data: { [key: string]: string } = {};
    
    Array.from(formDataObj.entries()).forEach(([key, value]) => {
      data[key] = value.toString();
    });
    
    setFormData(data);
    console.log('Form submitted with data:', data);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
            AccessibleDatePicker Demo
          </h1>

          <div className="space-y-8">
            {/* Basic Usage */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Basic Date Picker
              </h2>
              <div className="space-y-4">
                <AccessibleDatePicker
                  id="basic-date"
                  placeholder="Select a date"
                  value={selectedDate}
                  onChange={setSelectedDate}
                  aria-label="Basic date picker"
                />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Selected: {formatDate(selectedDate)}
                </p>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <p>Keyboard shortcuts:</p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Arrow keys: Navigate dates</li>
                    <li>Enter or Alt+Down: Open calendar</li>
                    <li>Escape: Close calendar</li>
                    <li>Type directly: YYYY-MM-DD format</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Required Field */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Required Date Picker
              </h2>
              <div className="space-y-4">
                <AccessibleDatePicker
                  id="required-date"
                  placeholder="Required date field"
                  value={requiredDate}
                  onChange={setRequiredDate}
                  required
                  aria-label="Required date picker"
                  className="border-red-300 dark:border-red-600"
                />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Selected: {formatDate(requiredDate)}
                </p>
              </div>
            </section>

            {/* Date Constraints */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Date Picker with Constraints
              </h2>
              <div className="space-y-4">
                <AccessibleDatePicker
                  id="constrained-date"
                  placeholder="Date within 30 days"
                  value={constrainedDate}
                  onChange={setConstrainedDate}
                  minValue={minDate}
                  maxValue={maxDate}
                  aria-label="Date picker with min/max constraints"
                />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Selected: {formatDate(constrainedDate)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Constrained between {formatDate(minDate)} and {formatDate(maxDate)}
                </p>
              </div>
            </section>

            {/* Disabled State */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Disabled Date Picker
              </h2>
              <div className="space-y-4">
                <AccessibleDatePicker
                  id="disabled-date"
                  placeholder="Disabled date picker"
                  value={new Date()}
                  onChange={() => {}}
                  isDisabled
                  aria-label="Disabled date picker"
                />
              </div>
            </section>

            {/* Form Integration */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Form Integration Test
              </h2>
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div>
                  <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Start Date
                  </label>
                  <AccessibleDatePicker
                    id="start-date"
                    name="startDate"
                    placeholder="Select start date"
                    required
                    aria-describedby="start-date-help"
                  />
                  <p id="start-date-help" className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    This field is required for form submission
                  </p>
                </div>

                <div>
                  <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    End Date (Optional)
                  </label>
                  <AccessibleDatePicker
                    id="end-date"
                    name="endDate"
                    placeholder="Select end date"
                  />
                </div>

                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Submit Form
                </button>
              </form>

              {Object.keys(formData).length > 0 && (
                <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-md">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-2">Form Data:</h3>
                  <pre className="text-sm text-gray-600 dark:text-gray-300">
                    {JSON.stringify(formData, null, 2)}
                  </pre>
                </div>
              )}
            </section>

            {/* Accessibility Information */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Accessibility Features
              </h2>
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md">
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
                  <li>✅ Full keyboard navigation support</li>
                  <li>✅ Screen reader compatible with ARIA labels</li>
                  <li>✅ Focus management and trapping in calendar</li>
                  <li>✅ Escape key closes calendar</li>
                  <li>✅ Enter key opens calendar</li>
                  <li>✅ Arrow keys navigate dates</li>
                  <li>✅ Direct text input with validation</li>
                  <li>✅ Form integration with hidden input</li>
                  <li>✅ Min/max date constraints</li>
                  <li>✅ UTC-based date handling to prevent hydration issues</li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}