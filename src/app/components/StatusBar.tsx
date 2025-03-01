'use client';

import React from 'react';

interface StatusBarProps {
  isOnline: boolean;
  lastSynced?: string;
  pendingSyncs: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
  onSync: () => void;
}

const StatusBar: React.FC<StatusBarProps> = ({
  isOnline,
  lastSynced,
  pendingSyncs,
  syncStatus,
  onSync,
}) => {
  const formatSyncTime = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };
  
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-t border-gray-200">
      <div className="flex items-center">
        <div className="flex items-center mr-4">
          <div 
            className={`w-3 h-3 rounded-full mr-2 ${
              isOnline ? 'bg-green-500' : 'bg-red-500'
            }`} 
          />
          <span className="text-sm text-gray-600">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
        
        {lastSynced && (
          <div className="text-sm text-gray-500">
            Last synced: {formatSyncTime(lastSynced)}
          </div>
        )}
      </div>
      
      <div className="flex items-center">
        {pendingSyncs > 0 && (
          <div className="mr-3 text-sm text-amber-600">
            {pendingSyncs} {pendingSyncs === 1 ? 'change' : 'changes'} pending
          </div>
        )}
        
        {syncStatus === 'conflict' && (
          <div className="mr-3 text-sm text-red-600">
            Sync conflict detected
          </div>
        )}
        
        <button
          onClick={onSync}
          disabled={!isOnline || (syncStatus === 'synced' && pendingSyncs === 0)}
          className={`px-3 py-1 rounded text-sm ${
            !isOnline || (syncStatus === 'synced' && pendingSyncs === 0)
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {syncStatus === 'conflict' 
            ? 'Resolve & Sync' 
            : pendingSyncs > 0 
              ? 'Sync Now' 
              : 'All Synced'
          }
        </button>
      </div>
    </div>
  );
};

export default StatusBar; 