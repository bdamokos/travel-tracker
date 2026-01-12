'use client';

import React, { useState } from 'react';
import AccessibleModal from '@/app/admin/components/AccessibleModal';

// This is a demo component to manually test the AccessibleModal
// Run this in a browser to verify functionality
export default function AccessibleModalDemo() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSize, setModalSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('lg');
  const [isDismissable, setIsDismissable] = useState(true);
  const [isKeyboardDismissDisabled, setIsKeyboardDismissDisabled] = useState(false);

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">AccessibleModal Demo</h1>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Controls</h2>

        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2">
            <span>Size:</span>
            <select
              value={modalSize}
              onChange={(e) => setModalSize(e.target.value as 'sm' | 'md' | 'lg' | 'xl')}
              className="border rounded px-2 py-1"
            >
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Large</option>
              <option value="xl">Extra Large</option>
            </select>
          </label>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={isDismissable}
              onChange={(e) => setIsDismissable(e.target.checked)}
            />
            <span>Dismissable</span>
          </label>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={isKeyboardDismissDisabled}
              onChange={(e) => setIsKeyboardDismissDisabled(e.target.checked)}
            />
            <span>Disable Keyboard Dismiss</span>
          </label>
        </div>
      </div>

      <button
        onClick={() => setIsModalOpen(true)}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Open Modal
      </button>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Test Instructions</h2>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Click "Open Modal" to open the modal</li>
          <li>Try pressing Escape to close (if keyboard dismiss is enabled)</li>
          <li>Try clicking the backdrop to close (if dismissable)</li>
          <li>Try clicking the X button to close</li>
          <li>Use Tab to navigate between focusable elements</li>
          <li>Test with screen reader if available</li>
        </ul>
      </div>

      <AccessibleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Demo Modal"
        size={modalSize}
        isDismissable={isDismissable}
        isKeyboardDismissDisabled={isKeyboardDismissDisabled}
      >
        <div className="space-y-4">
          <p>This is a demo of the AccessibleModal component.</p>

          <div className="space-y-2">
            <h3 className="font-semibold">Interactive Elements</h3>
            <input
              type="text"
              placeholder="Test input field"
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2"
              onClick={() => alert('Test button clicked!')}
            >
              Test Button
            </button>
            <select className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option>Option 1</option>
              <option>Option 2</option>
              <option>Option 3</option>
            </select>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Accessibility Features</h3>
            <ul className="list-disc list-inside text-sm space-y-1">
              <li>Focus is trapped within the modal</li>
              <li>Escape key closes the modal (if enabled)</li>
              <li>Clicking backdrop closes modal (if dismissable)</li>
              <li>Screen reader announces modal opening</li>
              <li>Focus returns to trigger element when closed</li>
            </ul>
          </div>

          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setIsModalOpen(false)}
              className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
            >
              Cancel
            </button>
            <button
              onClick={() => setIsModalOpen(false)}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
            >
              Save
            </button>
          </div>
        </div>
      </AccessibleModal>
    </div>
  );
}