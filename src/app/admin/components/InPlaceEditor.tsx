'use client';

import { useState, ReactNode } from 'react';

interface InPlaceEditorProps<T> {
  data: T;
  onSave: (data: T) => Promise<void> | void;
  children: (data: T, isEditing: boolean, onEdit: () => void) => ReactNode;
  editor: (data: T, onSave: (data: T) => void, onCancel: () => void) => ReactNode;
  className?: string;
}

function InPlaceEditor<T>({ 
  data, 
  onSave, 
  children, 
  editor, 
  className = '' 
}: InPlaceEditorProps<T>) {
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async (newData: T) => {
    setIsLoading(true);
    try {
      await onSave(newData);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving data:', error);
      // Stay in edit mode if save fails
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  return (
    <div className={`in-place-editor ${className}`}>
      {isEditing ? (
        <div className="relative">
          {editor(data, handleSave, handleCancel)}
          {isLoading && (
            <div className="absolute inset-0 bg-white bg-opacity-75 dark:bg-gray-800 dark:bg-opacity-75 flex items-center justify-center rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-sm text-gray-600 dark:text-gray-300">Saving...</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        children(data, isEditing, handleEdit)
      )}
    </div>
  );
}

export default InPlaceEditor;