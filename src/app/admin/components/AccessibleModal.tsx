'use client';

import React, { useRef, useEffect } from 'react';
import { useDialog } from '@react-aria/dialog';
import { useOverlay } from '@react-aria/overlays';
import { useButton } from '@react-aria/button';
import { FocusScope } from '@react-aria/focus';
import { OverlayContainer } from '@react-aria/overlays';

interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
  showOverlay?: boolean;
}

export default function AccessibleModal({
  isOpen,
  onClose,
  title,
  children,
  size = 'lg',
  className = '',
  isDismissable = true,
  isKeyboardDismissDisabled = false,
  showOverlay = true
}: AccessibleModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // React Aria hooks for modal behavior
  const { overlayProps, underlayProps } = useOverlay(
    {
      isOpen,
      onClose,
      isDismissable,
      isKeyboardDismissDisabled
    },
    ref
  );

  const { dialogProps, titleProps } = useDialog({}, ref);
  const { buttonProps: closeButtonProps } = useButton(
    {
      onPress: onClose,
      'aria-label': 'Close modal'
    },
    closeButtonRef
  );

  // Size classes mapping
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl'
  };

  // Handle body scroll lock when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
    return undefined;
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <OverlayContainer>
      <div
        className={`fixed inset-0 flex items-center justify-center p-4 z-50 ${showOverlay ? 'bg-black bg-opacity-50' : ''}`}
        {...underlayProps}
      >
        <FocusScope contain restoreFocus autoFocus>
          <div
            {...overlayProps}
            {...dialogProps}
            ref={ref}
            role="dialog"
            aria-modal="true"
            className={`bg-white dark:bg-gray-900 rounded-lg shadow-xl ${sizeClasses[size]} w-full max-h-[90vh] overflow-y-auto ${className}`}
          >
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2
                  {...titleProps}
                  className="text-2xl font-bold text-gray-800 dark:text-white"
                >
                  {title}
                </h2>
                <button
                  {...closeButtonProps}
                  ref={closeButtonRef}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                >
                  ×
                </button>
              </div>
              {children}
            </div>
          </div>
        </FocusScope>
      </div>
    </OverlayContainer>
  );
}