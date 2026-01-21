'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CostTrackingData, Journey, JourneyDay, Transportation } from '@/app/types';
import { transportationColors } from '@/app/lib/routeUtils';
import { ExpenseTravelLookup } from '@/app/lib/expenseTravelLookup';
import AccommodationDisplay from '@/app/components/AccommodationDisplay';
import TikTokIcon from '@/app/components/icons/TikTokIcon';
import { formatCurrency } from '@/app/lib/costUtils';

interface TimelineProps {
  journey: Journey | null;
  selectedDayId?: string;
  onDaySelect: (dayId: string) => void;
  onAddDay: () => void;
  isAdminView?: boolean; // For privacy filtering
  travelLookup?: ExpenseTravelLookup | null;
  costData?: CostTrackingData | null;
}

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
                {day.locations.map(location => (
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
                      {location.blogPosts && location.blogPosts.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-semibold text-green-700 mb-1">📝 Blog Posts:</div>
                          <div className="space-y-1">
                            {location.blogPosts.map((post, index) => (
                              <div key={post.id || index}>
                                <a
                                  href={post.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-green-600 hover:text-green-800 text-xs underline block"
                                  title={post.title}
                                >
                                  {post.title.length > 40 ? `${post.title.substring(0, 40)}...` : post.title}
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Display Instagram Posts */}
                      {location.instagramPosts && location.instagramPosts.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-semibold text-blue-700 mb-1">📸 Instagram:</div>
                          <div className="space-y-1">
                            {location.instagramPosts.map((post, index) => (
                              <div key={post.id || index}>
                                <a
                                  href={post.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 text-xs underline block"
                                  title={post.url}
                                >
                                  View Post {location.instagramPosts!.length > 1 ? `#${index + 1}` : ''}
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Display TikTok Posts */}
                      {location.tikTokPosts && location.tikTokPosts.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                            <TikTokIcon containerClassName="w-4 h-4" iconClassName="w-2.5 h-2.5" ariaLabel="TikTok" />
                            <span>TikTok:</span>
                          </div>
                          <div className="space-y-1">
                            {location.tikTokPosts.map((post, index) => (
                              <div key={post.id || index}>
                                <a
                                  href={post.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-gray-700 hover:text-gray-900 text-xs underline block"
                                  title={post.caption || post.url}
                                >
                                  Watch Clip {location.tikTokPosts!.length > 1 ? `#${index + 1}` : ''}
                                </a>
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
                ))}
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
          {day.instagramPosts && day.instagramPosts.length > 0 && (
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Instagram Posts</h4>
              <div className="space-y-2">
                {day.instagramPosts.map(post => (
                  <div key={post.id} className="border border-gray-200 dark:border-gray-700 rounded-sm p-2">
                    <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 dark:text-blue-400 text-sm hover:underline">
                      View Instagram Post
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TikTok Posts */}
          {day.tikTokPosts && day.tikTokPosts.length > 0 && (
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">TikTok Posts</h4>
              <div className="space-y-2">
                {day.tikTokPosts.map(post => (
                  <div key={post.id} className="border border-gray-200 dark:border-gray-700 rounded-sm p-2">
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-700 dark:text-gray-200 text-sm hover:underline"
                    >
                      View TikTok Post
                    </a>
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
      const linkedExpenseIds = travelLookup.getExpensesForTravelItem('route', id);
      const linkedExpenses = costData.expenses.filter(exp => linkedExpenseIds.includes(exp.id));
      const total = linkedExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      setTotalLinkedCost(total);
    }
  }, [travelLookup, costData, id]);

  const getTransportIcon = (type: Transportation['type']) => {
    switch (type) {
      case 'walk':
        return '🚶';
      case 'bus':
        return '🚌';
      case 'shuttle':
        return '🚐';
      case 'train':
        return '🚆';
      case 'plane':
        return '✈️';
      case 'car':
        return '🚗';
      case 'ferry':
        return '⛴️';
      case 'bike':
        return '🚲';
      case 'metro':
        return '🚇';
      case 'boat':
        return '🚢';
      case 'other':
      default:
        return '🚀';
    }
  };

  const hasSubRoutes = (subRoutes?.length || 0) > 0;

  // For multisegment routes, derive emoji from the segments
  const getTransportEmoji = () => {
    if (!hasSubRoutes) return getTransportIcon(type);
    return subRoutes!.map(segment => getTransportIcon(segment.type)).join('');
  };

  const getTransportTypeLabel = () => {
    if (hasSubRoutes) return 'Multisegment';
    return type;
  };

  return (
    <div className="flex items-start">
      <div className="shrink-0 mt-1 text-xl" style={{ color: transportationColors[type] }}>
        {getTransportEmoji()}
      </div>
      <div className="ml-2">
        <div className="font-medium capitalize text-gray-900 dark:text-white">
          {getTransportTypeLabel()} from {from} to {to}
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
