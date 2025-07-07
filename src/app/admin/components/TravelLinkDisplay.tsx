'use client';

import { TravelReference } from '../../types';

interface TravelLinkDisplayProps {
  travelReference?: TravelReference;
  className?: string;
  onRemove?: () => void;
  showRemoveButton?: boolean;
}

export default function TravelLinkDisplay({ 
  travelReference, 
  className = '', 
  onRemove, 
  showRemoveButton = false 
}: TravelLinkDisplayProps) {
  if (!travelReference) return null;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'location': return '📍';
      case 'accommodation': return '🏨';
      case 'route': return '🚌';
      default: return '🔗';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'location': return 'Location';
      case 'accommodation': return 'Accommodation';
      case 'route': return 'Route';
      default: return 'Travel Item';
    }
  };

  return (
    <div className={`inline-flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-1 rounded ${className}`}>
      <span>{getTypeIcon(travelReference.type)}</span>
      <span>{getTypeLabel(travelReference.type)}</span>
      {travelReference.description && (
        <span className="text-blue-600 dark:text-blue-400">
          • {travelReference.description}
        </span>
      )}
      {showRemoveButton && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 text-red-500 hover:text-red-700 font-bold"
          title="Remove link"
        >
          ×
        </button>
      )}
    </div>
  );
}