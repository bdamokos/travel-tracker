'use client';

import React, { useId, useState } from 'react';
import { parseAccommodationData, generateAccommodationTemplate } from '@/app/lib/privacyUtils';

interface AccommodationInputProps {
  accommodationData?: string;
  isAccommodationPublic?: boolean;
  onAccommodationDataChange: (data: string) => void;
  onPrivacyChange: (isPublic: boolean) => void;
}

export default function AccommodationInput({
  accommodationData = '',
  isAccommodationPublic = false,
  onAccommodationDataChange,
  onPrivacyChange
}: AccommodationInputProps) {
  const [showPreview, setShowPreview] = useState(false);
  const id = useId();
  
  const parsedData = parseAccommodationData(accommodationData);

  const handleTemplateClick = () => {
    if (!accommodationData.trim()) {
      onAccommodationDataChange(generateAccommodationTemplate());
    } else {
      // Ask user if they want to replace existing content
      const confirmed = window.confirm(
        'This will replace your current accommodation data with a template. Continue?'
      );
      if (confirmed) {
        onAccommodationDataChange(generateAccommodationTemplate());
      }
    }
  };

  const renderStructuredPreview = () => {
    if (!parsedData.isStructured || !parsedData.data) {
      return null;
    }

    const data = parsedData.data;
    return (
      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
        <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Structured View:</h5>
        <div className="space-y-1 text-sm">
          {data.name && (
            <div><span className="font-medium">Name:</span> {data.name}</div>
          )}
          {data.address && (
            <div><span className="font-medium">Address:</span> {data.address}</div>
          )}
          {data.website && (
            <div>
              <span className="font-medium">Website:</span>{' '}
              <a 
                href={data.website} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                {data.website}
              </a>
            </div>
          )}
          {data.phone && (
            <div><span className="font-medium">Phone:</span> {data.phone}</div>
          )}
          {data.checkin && (
            <div><span className="font-medium">Check-in:</span> {data.checkin}</div>
          )}
          {data.checkout && (
            <div><span className="font-medium">Check-out:</span> {data.checkout}</div>
          )}
          {data.notes && (
            <div className="mt-2">
              <span className="font-medium">Notes:</span>
              <div className="whitespace-pre-wrap mt-1 text-gray-700 dark:text-gray-300">
                {data.notes}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPlainTextPreview = () => {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
        <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Free Text View:</h5>
        <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
          {accommodationData || <em>No accommodation data</em>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-between items-center mb-2">
          <label htmlFor={`${id}-details`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Accommodation Details
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTemplateClick}
              className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              📝 Template
            </button>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              {showPreview ? '👁️ Hide Preview' : '👁️ Preview'}
            </button>
          </div>
        </div>
        
        <textarea
          id={`${id}-details`}
          value={accommodationData}
          onChange={(e) => onAccommodationDataChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          rows={8}
          placeholder="Enter accommodation details (free text or use template for structured data)..."
        />
        
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {parsedData.isStructured ? (
            <>✅ Structured data detected (YAML format)</>
          ) : (
            <>📝 Free text format</>
          )}
        </div>
      </div>

      {/* Privacy Toggle */}
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="accommodation-public"
          checked={isAccommodationPublic}
          onChange={(e) => onPrivacyChange(e.target.checked)}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="accommodation-public" className="text-sm text-gray-700 dark:text-gray-300">
          Make accommodation details public (visible on embeddable maps)
        </label>
      </div>

      {/* Preview */}
      {showPreview && accommodationData && (
        <div className="border-t pt-4">
          {parsedData.isStructured ? renderStructuredPreview() : renderPlainTextPreview()}
        </div>
      )}

      {/* Template Help */}
      {!accommodationData && (
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
          💡 <strong>Tip:</strong> Click &quot;Template&quot; to use structured format, or just type freely for places like &quot;staying at friend&apos;s house&quot;
        </div>
      )}
    </div>
  );
}