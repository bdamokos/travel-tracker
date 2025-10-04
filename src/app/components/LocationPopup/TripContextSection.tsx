/**
 * Trip context section for LocationPopup
 * Shows dates, times, and linked blog/Instagram posts
 */

'use client';

import React from 'react';
import { Location, JourneyDay } from '../../types';
import { formatDateRange } from '../../lib/dateUtils';

interface TripContextSectionProps {
  location: Location;
  day: JourneyDay;
  tripId: string;
}

export default function TripContextSection({
  location,
  day,
  tripId: _tripId
}: TripContextSectionProps) {
  // Check if this is a transition day (multiple locations)
  const isTransition = day.locations && day.locations.length > 1;
  const secondaryLocation = isTransition ? day.locations[1] : null;

  const renderBlogPosts = (sourceLocation: Location | null | undefined, contextLabel?: string) => {
    if (!sourceLocation || !sourceLocation.blogPosts || sourceLocation.blogPosts.length === 0) {
      return null;
    }

    const posts = sourceLocation.blogPosts;
    const headingLabel = contextLabel ? `${contextLabel}: Blog Posts` : 'Blog Posts';

    return (
      <div>
        <h4 className="font-semibold text-green-700 dark:text-green-400 mb-3 flex items-center">
          <span className="mr-2">📝</span>
          {headingLabel} ({posts.length})
        </h4>
        <div className="space-y-2">
          {posts.map((post, index) => (
            <a
              key={post.id || index}
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border-l-4 border-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h5 className="text-green-700 dark:text-green-400 font-medium text-sm group-hover:text-green-800 dark:group-hover:text-green-300 transition-colors">
                    {post.title}
                  </h5>
                  {post.excerpt && (
                    <p className="text-xs text-green-600 dark:text-green-500 mt-1 line-clamp-2">
                      {post.excerpt}
                    </p>
                  )}
                </div>
                <svg
                  className="w-4 h-4 text-green-500 ml-2 group-hover:text-green-600 transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      </div>
    );
  };

  const renderInstagramPosts = (sourceLocation: Location | null | undefined, contextLabel?: string) => {
    if (!sourceLocation || !sourceLocation.instagramPosts || sourceLocation.instagramPosts.length === 0) {
      return null;
    }

    const posts = sourceLocation.instagramPosts;
    const total = posts.length;
    const headingLabel = contextLabel ? `${contextLabel}: Instagram Posts` : 'Instagram Posts';

    return (
      <div>
        <h4 className="font-semibold text-blue-700 dark:text-blue-400 mb-3 flex items-center">
          <span className="mr-2">📸</span>
          {headingLabel} ({total})
        </h4>
        <div className="space-y-2">
          {posts.map((post, index) => {
            const caption = post.caption?.trim() || '';
            const fallbackLabel = `Instagram Post${total > 1 ? ` #${index + 1}` : ''}`;

            return (
              <a
                key={post.id || index}
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-l-4 border-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors group"
                title={caption || fallbackLabel}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center mr-3">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.441s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    </div>
                    <span className="text-blue-700 dark:text-blue-400 font-medium text-sm group-hover:text-blue-800 dark:group-hover:text-blue-300 transition-colors">
                      {fallbackLabel}
                    </span>
                  </div>
                  <svg
                    className="w-4 h-4 text-blue-500 group-hover:text-blue-600 transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>
                {caption && (
                  <p className="text-xs text-blue-600 dark:text-blue-300 mt-2">{caption}</p>
                )}
              </a>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTikTokPosts = (sourceLocation: Location | null | undefined, contextLabel?: string) => {
    if (!sourceLocation || !sourceLocation.tikTokPosts || sourceLocation.tikTokPosts.length === 0) {
      return null;
    }

    const posts = sourceLocation.tikTokPosts;
    const total = posts.length;
    const headingLabel = contextLabel ? `${contextLabel}: TikTok Posts` : 'TikTok Posts';

    return (
      <div>
        <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center">
          <span className="mr-2">🎵</span>
          {headingLabel} ({total})
        </h4>
        <div className="space-y-2">
          {posts.map((post, index) => (
            <a
              key={post.id || index}
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-gray-100 dark:bg-gray-700 rounded-lg border-l-4 border-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-black text-white rounded-lg flex items-center justify-center mr-3">
                    <span className="text-sm">Tik</span>
                  </div>
                  <span className="text-gray-800 dark:text-gray-100 font-medium text-sm group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                    TikTok Clip {total > 1 ? `#${index + 1}` : ''}
                  </span>
                </div>
                <svg
                  className="w-4 h-4 text-gray-500 group-hover:text-gray-600 transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
              {post.caption && (
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">{post.caption}</p>
              )}
            </a>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Basic Trip Information */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
          {isTransition ? 'Transition Day Details' : 'Trip Details'}
        </h3>
        
        <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
          {isTransition ? (
            <>
              <p>
                <span className="font-medium">Departure from:</span> {location.name}
              </p>
              <p className="ml-4 text-xs">
                <span className="font-medium">Stay period:</span> {formatDateRange(location.date, location.endDate)}
              </p>
              {secondaryLocation && (
                <>
                  <p className="mt-2">
                    <span className="font-medium">Arrival to:</span> {secondaryLocation.name}
                  </p>
                  <p className="ml-4 text-xs">
                    <span className="font-medium">Stay period:</span> {formatDateRange(secondaryLocation.date, secondaryLocation.endDate)}
                  </p>
                </>
              )}
            </>
          ) : (
            <p>
              <span className="font-medium">Stay:</span> {formatDateRange(location.date, location.endDate)}
            </p>
          )}
          
          {location.arrivalTime && (
            <p>
              <span className="font-medium">Arrival:</span> {location.arrivalTime}
            </p>
          )}
          
          {location.notes && (
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
              <p className="italic">{location.notes}</p>
            </div>
          )}
        </div>
      </div>

      {renderBlogPosts(location)}

      {renderInstagramPosts(location)}

      {renderTikTokPosts(location)}

      {secondaryLocation && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-600 space-y-4">
          <h4 className="font-semibold text-gray-900 dark:text-white">
            Arrival Highlights: {secondaryLocation.name}
          </h4>
          {renderBlogPosts(secondaryLocation, 'Arrival')}
          {renderInstagramPosts(secondaryLocation, 'Arrival')}
          {renderTikTokPosts(secondaryLocation, 'Arrival')}
        </div>
      )}
    </div>
  );
}
