'use client';

import React, { useRef } from 'react';
import { useComboBox } from '@react-aria/combobox';
import { useFilter } from '@react-aria/i18n';
import { useComboBoxState } from '@react-stately/combobox';
import { useButton } from '@react-aria/button';
import { useOption } from '@react-aria/listbox';
import { Item } from '@react-stately/collections';
import type { ComboBoxState } from '@react-stately/combobox';
import type { AriaListBoxOptions } from '@react-aria/listbox';

interface ComboBoxOption {
  value: string;
  label: string;
}

interface AriaComboBoxProps {
  id: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  className?: string;
  options: ComboBoxOption[];
  placeholder?: string;
  allowsCustomValue?: boolean;
}

export default function AriaComboBox({
  id,
  name,
  value,
  defaultValue = '',
  onChange,
  required = false,
  className = '',
  options,
  placeholder = 'Type to search...',
  allowsCustomValue = true
}: AriaComboBoxProps) {
  // Create filter for search functionality
  const { contains } = useFilter({
    sensitivity: 'base'
  });

  // Create state for the combobox
  const state = useComboBoxState({
    defaultItems: options,
    children: (item: ComboBoxOption) => <Item key={item.value}>{item.label}</Item>,
    allowsCustomValue,
    onInputChange: (value) => {
      onChange?.(value);
    },
    defaultInputValue: defaultValue || '',
    inputValue: value || '',
    onSelectionChange: (key) => {
      if (key) {
        const selectedOption = options.find(option => option.value === key);
        if (selectedOption) {
          onChange?.(selectedOption.value);
        }
      }
    }
  });

  // Create refs for the input and listbox
  const inputRef = useRef<HTMLInputElement>(null);
  const listBoxRef = useRef<HTMLUListElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Get combobox props from useComboBox
  const {
    buttonProps: triggerProps,
    inputProps,
    listBoxProps
  } = useComboBox(
    {
      id,
      'aria-label': placeholder,
      placeholder,
      isRequired: required,
      allowsCustomValue,
      inputRef,
      popoverRef,
      listBoxRef
    },
    state
  );

  // Get button props for the dropdown trigger
  const { buttonProps } = useButton(triggerProps, inputRef);

  // Filter options based on input
  const filteredOptions = options.filter(option =>
    contains(option.label, state.inputValue)
  );

  const baseClassName = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white";
  const finalClassName = `${baseClassName} ${className}`;

  return (
    <div className="relative">
      <div className="flex">
        <input
          {...inputProps}
          name={name}
          ref={inputRef}
          className={finalClassName}
        />
        <button
          {...buttonProps}
          className="ml-1 px-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-600 hover:bg-gray-100 dark:hover:bg-gray-500"
          aria-label="Show options"
        >
          ▼
        </button>
      </div>
      
      {state.isOpen && (
        <div
          ref={popoverRef}
          className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          <ListBox
            listBoxProps={listBoxProps}
            listBoxRef={listBoxRef}
            filteredOptions={filteredOptions}
            state={state}
          />
        </div>
      )}
    </div>
  );
}

interface ListBoxProps {
  listBoxProps: AriaListBoxOptions<ComboBoxOption>;
  listBoxRef: React.RefObject<HTMLUListElement | null>;
  filteredOptions: ComboBoxOption[];
  state: ComboBoxState<ComboBoxOption>;
}

function ListBox({ listBoxProps, listBoxRef, filteredOptions, state }: ListBoxProps) {
  // Filter out React Aria specific props that shouldn't be passed to DOM
  const { linkBehavior, ...domProps } = listBoxProps as any; // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  
  return (
    <ul
      {...domProps}
      ref={listBoxRef}
      className="py-1"
    >
      {filteredOptions.length > 0 ? (
        filteredOptions.map((option) => (
          <ComboBoxOption
            key={option.value}
            option={option}
            state={state}
          />
        ))
      ) : (
        <li className="px-3 py-2 text-gray-500 dark:text-gray-400">
          No options found
        </li>
      )}
    </ul>
  );
}

interface ComboBoxOptionProps {
  option: ComboBoxOption;
  state: ComboBoxState<ComboBoxOption>;
}

function ComboBoxOption({ option, state }: ComboBoxOptionProps) {
  const ref = useRef<HTMLLIElement>(null);
  const { optionProps, isPressed, isFocused } = useOption(
    {
      key: option.value,
      'aria-label': option.label
    },
    state,
    ref
  );

  return (
    <li
      {...optionProps}
      ref={ref}
      className={`px-3 py-2 cursor-pointer outline-none ${
        isFocused ? 'bg-blue-500 text-white' : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
      } ${isPressed ? 'bg-blue-600' : ''}`}
    >
      {option.label}
    </li>
  );
}