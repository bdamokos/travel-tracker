/**
 * Trip context section for LocationPopup
 * Shows dates, times, and linked blog/Instagram posts
 */

'use client';

import React from 'react';
import { Location, JourneyDay } from '../../types';
import { formatDateRange } from '../../lib/dateUtils';
import InstagramIcon from '../icons/InstagramIcon';
import TikTokIcon from '../icons/TikTokIcon';

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
                    <InstagramIcon className="mr-3" ariaLabel="Instagram" />
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
          <TikTokIcon
            className="mr-2"
            containerClassName="w-6 h-6"
            iconClassName="w-3.5 h-3.5"
            ariaLabel="TikTok"
          />
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
                  <TikTokIcon
                    className="mr-3"
                    containerClassName="w-6 h-6"
                    iconClassName="w-3.5 h-3.5"
                    ariaLabel="TikTok"
                  />
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
