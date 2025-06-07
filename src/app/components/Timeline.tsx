'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Journey, JourneyDay, Transportation } from '../types';
import { transportationColors } from '../lib/routeUtils';

interface TimelineProps {
  journey: Journey | null;
  selectedDayId?: string;
  onDaySelect: (dayId: string) => void;
  onAddDay: () => void;
}

const Timeline: React.FC<TimelineProps> = ({ journey, selectedDayId, onDaySelect, onAddDay }) => {
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null);
  
  const toggleDay = (dayId: string) => {
    setExpandedDayId(expandedDayId === dayId ? null : dayId);
    onDaySelect(dayId);
  };
  
  if (!journey) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">No journey selected</p>
      </div>
    );
  }
  
  if (journey.days.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-gray-500 mb-4">No travel periods added to this journey yet</p>
          <button 
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={onAddDay}
          >
            Add First Period
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full overflow-y-auto bg-white p-4">
      <h2 className="text-xl font-bold mb-4">{journey.title}</h2>
      
      <div className="space-y-4">
        {journey.days.map(day => (
          <DayCard
            key={day.id}
            day={day}
            isExpanded={expandedDayId === day.id || selectedDayId === day.id}
            isSelected={selectedDayId === day.id}
            onClick={() => toggleDay(day.id)}
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
}

const DayCard: React.FC<DayCardProps> = ({ day, isExpanded, isSelected, onClick }) => {
  const formattedDate = format(new Date(day.date), 'MMM d, yyyy');
  
  return (
    <div 
      className={`border rounded-lg overflow-hidden transition-all ${
        isSelected ? 'border-blue-500 shadow-md' : 'border-gray-200'
      }`}
    >
      <div 
        className={`p-4 cursor-pointer flex justify-between items-center ${
          isSelected ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
        }`}
        onClick={onClick}
      >
        <div>
          <h3 className="font-bold">{day.title}</h3>
          <p className="text-sm text-gray-500">{formattedDate}</p>
        </div>
        <div className="text-gray-400">
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
      </div>
      
      {isExpanded && (
        <div className="p-4 border-t border-gray-200">
          {/* Locations */}
          {day.locations.length > 0 && (
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-500 mb-2">Locations</h4>
              <div className="space-y-2">
                {day.locations.map(location => (
                  <div key={location.id} className="flex items-start">
                    <div className="flex-shrink-0 mt-1">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-red-500">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                    </div>
                    <div className="ml-2">
                      <div className="font-medium">{location.name}</div>
                      {location.arrivalTime && (
                        <div className="text-xs text-gray-500">Arrived: {location.arrivalTime}</div>
                      )}
                      {location.notes && (
                        <div className="text-sm mt-1 text-gray-600">{location.notes}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Transportation */}
          {day.transportation && (
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-500 mb-2">Transportation</h4>
              <TransportationItem transportation={day.transportation} />
            </div>
          )}
          
          {/* Instagram Posts */}
          {day.instagramPosts && day.instagramPosts.length > 0 && (
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-500 mb-2">Instagram Posts</h4>
              <div className="space-y-2">
                {day.instagramPosts.map(post => (
                  <div key={post.id} className="border border-gray-200 rounded p-2">
                    {post.offline ? (
                      <div className="text-sm text-gray-500">Offline Instagram Post (will be synced later)</div>
                    ) : (
                      <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 text-sm hover:underline">
                        View Instagram Post
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Notes */}
          {day.customNotes && (
            <div>
              <h4 className="text-sm font-semibold text-gray-500 mb-2">Notes</h4>
              <p className="text-sm">{day.customNotes}</p>
            </div>
          )}
          
          {/* Edit Status */}
          <div className="mt-4 text-xs text-gray-400 flex justify-between">
            <span>
              Status: {day.editStatus === 'synced' ? 'Synced' : day.editStatus === 'draft' ? 'Draft' : 'Modified'}
            </span>
            <button className="text-blue-500 hover:underline">Edit</button>
          </div>
        </div>
      )}
    </div>
  );
};

interface TransportationItemProps {
  transportation: Transportation;
}

const TransportationItem: React.FC<TransportationItemProps> = ({ transportation }) => {
  const { type, from, to, distance, departureTime, arrivalTime } = transportation;
  
  const getTransportIcon = (type: Transportation['type']) => {
    switch (type) {
      case 'walk':
        return '🚶';
      case 'bus':
        return '🚌';
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
      case 'other':
      default:
        return '🚀';
    }
  };
  
  return (
    <div className="flex items-start">
      <div className="flex-shrink-0 mt-1 text-xl" style={{ color: transportationColors[type] }}>
        {getTransportIcon(type)}
      </div>
      <div className="ml-2">
        <div className="font-medium capitalize">
          {type} from {from} to {to}
        </div>
        <div className="text-xs text-gray-500">
          {departureTime && arrivalTime ? (
            <>Departed: {departureTime} - Arrived: {arrivalTime}</>
          ) : departureTime ? (
            <>Departed: {departureTime}</>
          ) : arrivalTime ? (
            <>Arrived: {arrivalTime}</>
          ) : null}
          {distance && <span> ({distance} km)</span>}
        </div>
      </div>
    </div>
  );
};

export default Timeline; 