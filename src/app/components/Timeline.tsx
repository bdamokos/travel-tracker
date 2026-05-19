'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { format } from 'date-fns';
import { CostTrackingData, Journey, JourneyDay, Transportation } from '@/app/types';
import { transportationColors, getTransportIcon, getMultiSegmentEmoji, getMultiSegmentAriaLabel, getCompositeTransportType } from '@/app/lib/routeUtils';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import AccommodationDisplay from '@/app/components/AccommodationDisplay';
import TikTokIcon from '@/app/components/icons/TikTokIcon';
import { formatCurrency } from '@/app/lib/costUtils';
import { isSafePublicHttpUrl } from '@/app/lib/publicUrlValidation';

interface TimelineProps {
  journey: Journey | null;
  selectedDayId?: string;
  onDaySelect: (dayId: string) => void;
  onAddDay: () => void;
  isAdminView?: boolean; // For privacy filtering
  travelLookup?: ExpenseTravelLookup | null;
  costData?: CostTrackingData | null;
}

interface SafeExternalLinkProps {
  url: string;
  className: string;
  title?: string;
  children: ReactNode;
}

const SafeExternalLink: React.FC<SafeExternalLinkProps> = ({ url, className, title, children }) => {
  if (!isSafePublicHttpUrl(url)) {
    return null;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title={title}
    >
      {children}
    </a>
  );
};

const safePosts = <T extends { url: string }>(posts?: T[]): T[] =>
  (posts ?? []).filter(post => isSafePublicHttpUrl(post.url));

const Timeline: React.FC<TimelineProps> = ({ journey, selectedDayId, onDaySelect, onAddDay, isAdminView = false, travelLookup, costData }) => {
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null);
  
  const toggleDay = (dayId: string) => {
    setExpandedDayId(expandedDayId === dayId ? null : dayId);
    onDaySelect(dayId);
  };
  
  if (!journey) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
        <p className="text-gray-500 dark:text-gray-400">No journey selected</p>
      </div>
    );
  }
  
  if (journey.days.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-800">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">No travel periods added to this journey yet</p>
          <button 
            className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-sm hover:bg-blue-600 dark:hover:bg-blue-700"
            onClick={onAddDay}
          >
            Add First Period
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-gray-800 p-4">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{journey.title}</h2>
      
      <div className="space-y-4">
        {journey.days.map(day => (
          <DayCard
            key={day.id}
            day={day}
            isExpanded={expandedDayId === day.id || selectedDayId === day.id}
            isSelected={selectedDayId === day.id}
            onClick={() => toggleDay(day.id)}
            isAdminView={isAdminView}
            travelLookup={travelLookup || null}
            costData={costData || null}
          />
        ))}
      </div>
    </div>
  );
};

interface DayCardProps {
  day: JourneyDay;
  isExpanded: boolean;
  isSelected: boolean;
  onClick: () => void;
  isAdminView: boolean;
  travelLookup: ExpenseTravelLookup | null;
  costData: CostTrackingData | null;
}

const DayCard: React.FC<DayCardProps> = ({ day, isExpanded, isSelected, onClick, isAdminView, travelLookup, costData }) => {
  const formattedDate = format(new Date(day.date), 'MMM d, yyyy');
  const headerId = `timeline-day-${day.id}-header`;
  const panelId = `timeline-day-${day.id}-panel`;
  const safeDayInstagramPosts = safePosts(day.instagramPosts);
  const safeDayTikTokPosts = safePosts(day.tikTokPosts);
  
  return (
    <div 
      className={`border rounded-lg overflow-hidden transition-all ${
        isSelected ? 'border-blue-500 shadow-md' : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        onClick={onClick}
        className={`w-full text-left p-4 cursor-pointer flex justify-between items-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${
          isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
        }`}
      >
        <div>
          <h3 id={headerId} className="font-bold text-gray-900 dark:text-white">{day.title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{formattedDate}</p>
        </div>
        <div className="text-gray-400 dark:text-gray-500">
          {isExpanded ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          )}
        </div>
      </button>
      
      {isExpanded && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          className="p-4 border-t border-gray-200 dark:border-gray-700"
        >
          {/* Locations */}
          {day.locations.length > 0 && (
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Locations</h4>
              <div className="space-y-2">
                {day.locations.map(location => {
                  const safeLocationBlogPosts = safePosts(location.blogPosts);
                  const safeLocationInstagramPosts = safePosts(location.instagramPosts);
                  const safeLocationTikTokPosts = safePosts(location.tikTokPosts);

                  return (
                  <div key={location.id} className="flex items-start">
                    <div className="shrink-0 mt-1">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-red-500">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                    </div>
                    <div className="ml-2">
                      <div className="font-medium text-gray-900 dark:text-white">{location.name}</div>
                      {location.arrivalTime && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">Arrived: {location.arrivalTime}</div>
                      )}
                      {location.notes && (
                        <div className="text-sm mt-1 text-gray-600 dark:text-gray-300">{location.notes}</div>
                      )}
                      
                      {/* Display Blog Posts */}
                      {safeLocationBlogPosts.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-semibold text-green-700 mb-1">📝 Blog Posts:</div>
                          <div className="space-y-1">
                            {safeLocationBlogPosts.map((post, index) => (
                              <div key={post.id || index}>
                                <SafeExternalLink
                                  url={post.url}
                                  className="text-green-600 hover:text-green-800 text-xs underline block"
                                  title={post.title}
                                >
                                  {post.title.length > 40 ? `${post.title.substring(0, 40)}...` : post.title}
                                </SafeExternalLink>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Display Instagram Posts */}
                      {safeLocationInstagramPosts.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-semibold text-blue-700 mb-1">📸 Instagram:</div>
                          <div className="space-y-1">
                            {safeLocationInstagramPosts.map((post, index) => (
                              <div key={post.id || index}>
                                <SafeExternalLink
                                  url={post.url}
                                  className="text-blue-600 hover:text-blue-800 text-xs underline block"
                                  title={post.url}
                                >
                                  View Post {safeLocationInstagramPosts.length > 1 ? `#${index + 1}` : ''}
                                </SafeExternalLink>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Display TikTok Posts */}
                      {safeLocationTikTokPosts.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                            <TikTokIcon containerClassName="w-4 h-4" iconClassName="w-2.5 h-2.5" ariaLabel="TikTok" />
                            <span>TikTok:</span>
                          </div>
                          <div className="space-y-1">
                            {safeLocationTikTokPosts.map((post, index) => (
                              <div key={post.id || index}>
                                <SafeExternalLink
                                  url={post.url}
                                  className="text-gray-700 hover:text-gray-900 text-xs underline block"
                                  title={post.caption || post.url}
                                >
                                  Watch Clip {safeLocationTikTokPosts.length > 1 ? `#${index + 1}` : ''}
                                </SafeExternalLink>
                                {post.caption && (
                                  <p className="text-[10px] text-gray-500">{post.caption}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Accommodation Display */}
                      <AccommodationDisplay
                        accommodationData={location.accommodationData}
                        isAccommodationPublic={location.isAccommodationPublic}
                        privacyOptions={{ isAdminView }}
                        className="mt-2"
                      />
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Transportation */}
          {day.transportation && (
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Transportation</h4>
              <TransportationItem 
                transportation={day.transportation} 
                travelLookup={travelLookup}
                costData={costData}
              />
            </div>
          )}
          
          {/* Instagram Posts */}
          {safeDayInstagramPosts.length > 0 && (
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Instagram Posts</h4>
              <div className="space-y-2">
                {safeDayInstagramPosts.map(post => (
                  <div key={post.id} className="border border-gray-200 dark:border-gray-700 rounded-sm p-2">
                    <SafeExternalLink url={post.url} className="text-blue-500 dark:text-blue-400 text-sm hover:underline">
                      View Instagram Post
                    </SafeExternalLink>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TikTok Posts */}
          {safeDayTikTokPosts.length > 0 && (
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">TikTok Posts</h4>
              <div className="space-y-2">
                {safeDayTikTokPosts.map(post => (
                  <div key={post.id} className="border border-gray-200 dark:border-gray-700 rounded-sm p-2">
                    <SafeExternalLink
                      url={post.url}
                      className="text-gray-700 dark:text-gray-200 text-sm hover:underline"
                    >
                      View TikTok Post
                    </SafeExternalLink>
                    {post.caption && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{post.caption}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Notes */}
          {day.customNotes && (
            <div>
              <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Notes</h4>
              <p className="text-sm text-gray-900 dark:text-white">{day.customNotes}</p>
            </div>
          )}
          
          {/* Edit Actions */}
          <div className="mt-4 text-xs text-gray-400 dark:text-gray-500 flex justify-end">
            <button className="text-blue-500 dark:text-blue-400 hover:underline">Edit</button>
          </div>
        </div>
      )}
    </div>
  );
};

interface TransportationItemProps {
  transportation: Transportation;
  travelLookup: ExpenseTravelLookup | null;
  costData: CostTrackingData | null;
}

const TransportationItem: React.FC<TransportationItemProps> = ({ transportation, travelLookup, costData }) => {
  const { type, from, to, distance, departureTime, arrivalTime, id, subRoutes } = transportation;
  const [totalLinkedCost, setTotalLinkedCost] = useState<number | null>(null);

  useEffect(() => {
    if (travelLookup && costData && id) {
      let isCurrent = true;
      const linkedExpenseIds = travelLookup.getExpensesForTravelItem('route', id);
      const linkedExpenses = costData.expenses.filter(exp => linkedExpenseIds.includes(exp.id));
      const total = linkedExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      queueMicrotask(() => {
        if (isCurrent) {
          setTotalLinkedCost(total);
        }
      });

      return () => {
        isCurrent = false;
      };
    }
    return undefined;
  }, [travelLookup, costData, id]);

  const hasSubRoutes = (subRoutes?.length || 0) > 0;
  const compositeType = hasSubRoutes && subRoutes
    ? getCompositeTransportType(subRoutes, type)
    : type;

  // Get the emoji to display (single for regular routes, concatenated for multimodal)
  const displayEmoji = hasSubRoutes && subRoutes
    ? getMultiSegmentEmoji(subRoutes)
    : getTransportIcon(type);

  // Get accessibility label for screen readers
  const ariaLabel = hasSubRoutes && subRoutes
    ? getMultiSegmentAriaLabel(subRoutes.length, compositeType)
    : `${type} from ${from} to ${to}`;

  // Get the label to display
  const transportTypeLabel = hasSubRoutes ? compositeType : type;

  // For multimodal routes, use the color of the first segment, otherwise use parent type color
  // TransportationSegment has 'type' property (not 'transportType')
  const firstSegmentType = hasSubRoutes && subRoutes && subRoutes[0]
    ? subRoutes[0].type
    : 'other';
  const displayColor = hasSubRoutes && subRoutes
    ? transportationColors[firstSegmentType] ?? transportationColors.other
    : transportationColors[type] ?? transportationColors.other;

  return (
    <div className="flex items-start">
      <div className="shrink-0 mt-1 text-xl" style={{ color: displayColor }}>
        <span aria-label={ariaLabel}>{displayEmoji}</span>
      </div>
      <div className="ml-2">
        <div className="font-medium capitalize text-gray-900 dark:text-white">
          {transportTypeLabel} from {from} to {to}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {departureTime && arrivalTime ? (
            <>Departed: {departureTime} - Arrived: {arrivalTime}</>
          ) : departureTime ? (
            <>Departed: {departureTime}</>
          ) : arrivalTime ? (
            <>Arrived: {arrivalTime}</>
          ) : null}
          {distance && <span> ({distance} km)</span>}
        </div>
        {totalLinkedCost !== null && totalLinkedCost > 0 && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-600 mt-2">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              💰 Linked Cost: {formatCurrency(totalLinkedCost, costData?.currency || 'EUR')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Timeline; 
