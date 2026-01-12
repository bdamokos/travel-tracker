/**
 * Wikipedia attribution component
 * Ensures compliance with Wikipedia's attribution requirements
 */

'use client';

import React from 'react';
import { StoredWikipediaData } from '@/app/types/wikipedia';

interface WikipediaAttributionProps {
  wikipediaData: StoredWikipediaData;
  className?: string;
}

export default function WikipediaAttribution({
  wikipediaData,
  className = ''
}: WikipediaAttributionProps) {
  return (
    <div className={`text-xs text-gray-500 dark:text-gray-400 ${className}`}>
      <div className="flex flex-col gap-1 p-2 bg-gray-100 dark:bg-gray-800 rounded border">
        {/* Text attribution */}
        <div className="flex items-center gap-1">
          <span>{wikipediaData.attribution.text}</span>
          <span>•</span>
          <a
            href={wikipediaData.attribution.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Original article
          </a>
        </div>

        {/* License */}
        <div>
          {wikipediaData.attribution.license}
        </div>

        {/* Image disclaimer for thumbnails */}
        {wikipediaData.thumbnail && (
          <div className="italic">
            {wikipediaData.attribution.imageDisclaimer}
          </div>
        )}

        {/* Last updated */}
        {/* <div className="text-gray-400 dark:text-gray-500">
          Data refreshed: {new Date(wikipediaData.lastFetched).toLocaleDateString()}
        </div> */}
      </div>
    </div>
  );
}