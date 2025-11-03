'use client';

import React from 'react';

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  key?: string;
}

interface AriaSelectProps {
  id: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  options: SelectOption[];
  placeholder?: string;
  children?: React.ReactNode;
}

export default function AriaSelect({
  id,
  name,
  defaultValue = '',
  value,
  onChange,
  required = false,
  disabled = false,
  className = '',
  options,
  placeholder = 'Select an option',
  children
}: AriaSelectProps) {
  // For now, let's create a simple enhanced native select that preserves form behavior
  // but adds proper ARIA attributes for accessibility
  
  const baseClassName = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white";
  const finalClassName = `${baseClassName} ${className}`;

  // Handle both controlled and uncontrolled usage
  const isControlled = value !== undefined;
  const selectProps = {
    id,
    name,
    required,
    disabled,
    className: finalClassName,
    'aria-label': placeholder,
    ...(isControlled 
      ? { 
          value, 
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange?.(e.target.value) 
        }
      : { defaultValue }
    )
  };

  return (
    <select {...selectProps}>
      {placeholder && (!isControlled ? defaultValue === '' : !value) && (
        <option value="">{placeholder}</option>
      )}
      {options.map(option => (
        <option
          key={option.key ?? option.value}
          value={option.value}
          disabled={option.disabled}
        >
          {option.label}
        </option>
      ))}
      {children}
    </select>
  );
}
