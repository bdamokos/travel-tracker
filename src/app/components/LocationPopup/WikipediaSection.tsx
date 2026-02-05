/**
 * Wikipedia section for LocationPopup
 * Shows Wikipedia extract, thumbnail, and attribution
 */

'use client';

import { StoredWikipediaData } from '@/app/types/wikipedia';
import WikipediaAttribution from './WikipediaAttribution';

interface WikipediaSectionProps {
  wikipediaData: StoredWikipediaData | null;
  loading: boolean;
  error: string | null;
}

export default function WikipediaSection({
  wikipediaData,
  loading,
  error
}: WikipediaSectionProps) {
  // Don't show section if no data and not loading
  if (!loading && !wikipediaData && !error) {
    return null;
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
      {/* <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
        <span className="mr-2">🌍</span>
        About {location.name}
      </h4> */}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
            Loading Wikipedia information...
          </span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-700 dark:text-red-400">
            Unable to load Wikipedia information: {error}
          </p>
        </div>
      )}

      {wikipediaData && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Thumbnail */}
            {wikipediaData.thumbnail && (
              <div className="flex-shrink-0">
                <img
                  src={wikipediaData.thumbnail.source}
                  alt={`${wikipediaData.title} thumbnail`}
                  className="w-24 h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                  loading="lazy"
                />
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h5 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                {wikipediaData.title}
              </h5>
              
              <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed mb-3">
                {wikipediaData.extract}
              </p>

              {/* Read more link */}
              <a
                href={wikipediaData.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium transition-colors"
              >
                Read more on Wikipedia
                <svg 
                  className="w-4 h-4 ml-1" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>

          {/* Attribution */}
          <WikipediaAttribution 
            wikipediaData={wikipediaData}
            className="mt-4"
          />
        </div>
      )}

      {/* No data state */}
      {!loading && !wikipediaData && !error && (
        <div className="text-center py-6">
          <div className="text-gray-400 dark:text-gray-500 mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C20.832 18.477 19.246 18 17.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Wikipedia information not available for this location
          </p>
        </div>
      )}
    </div>
  );
}
