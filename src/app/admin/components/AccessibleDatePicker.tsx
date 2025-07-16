'use client';

import React, { useRef } from 'react';
import { useDatePicker } from '@react-aria/datepicker';
import { useCalendar, useCalendarGrid, useCalendarCell } from '@react-aria/calendar';
import { useDatePickerState } from '@react-stately/datepicker';
import { useCalendarState } from '@react-stately/calendar';
import { useButton } from '@react-aria/button';
import { useDialog } from '@react-aria/dialog';
import { useOverlay, useModal, DismissButton, OverlayProvider } from '@react-aria/overlays';
import { useFocusRing } from '@react-aria/focus';
import { CalendarDate, createCalendar } from '@internationalized/date';
import type { DateValue } from '@internationalized/date';
import type { AriaDialogProps } from '@react-aria/dialog';
import type { CalendarProps as AriaCalendarProps } from '@react-aria/calendar';

interface AccessibleDatePickerProps {
  id: string;
  name?: string;
  value?: Date | null;
  defaultValue?: Date | null;
  onChange?: (date: Date | null) => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
  minValue?: Date;
  maxValue?: Date;
  isDisabled?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

// Utility functions for date conversion
function dateToCalendarDate(date: Date | null): CalendarDate | null {
  if (!date) return null;
  try {
    // Use local date components to avoid timezone issues
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return new CalendarDate(year, month, day);
  } catch {
    return null;
  }
}

function calendarDateToDate(calendarDate: CalendarDate | null): Date | null {
  if (!calendarDate) return null;
  try {
    // Create date using local time to avoid timezone issues
    return new Date(calendarDate.year, calendarDate.month - 1, calendarDate.day);
  } catch {
    return null;
  }
}

function formatDateForInput(date: Date | null): string {
  if (!date) return '';
  try {
    // Format as YYYY-MM-DD using local date components
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
}

function parseDateFromInput(value: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  try {
    const [year, month, day] = value.split('-').map(Number);
    // Create date using local time to avoid timezone issues
    return new Date(year, month - 1, day);
  } catch {
    return null;
  }
}

export default function AccessibleDatePicker({
  id,
  name,
  value,
  defaultValue,
  onChange,
  required = false,
  className = '',
  placeholder = 'YYYY-MM-DD',
  minValue,
  maxValue,
  isDisabled = false,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy
}: AccessibleDatePickerProps) {
  const state = useDatePickerState({
    value: dateToCalendarDate(value ?? null),
    defaultValue: dateToCalendarDate(defaultValue ?? null),
    minValue: dateToCalendarDate(minValue ?? null),
    maxValue: dateToCalendarDate(maxValue ?? null),
    onChange: (date: DateValue | null) => {
      const jsDate = calendarDateToDate(date as CalendarDate | null);
      onChange?.(jsDate);
    },
    isDisabled
  });

  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const {
    groupProps,
    buttonProps: calendarButtonProps,
    dialogProps,
    calendarProps
  } = useDatePicker(
    {
      'aria-label': ariaLabel || placeholder,
      'aria-describedby': ariaDescribedBy,
      isRequired: required,
      isDisabled
    },
    state,
    ref
  );

  const { buttonProps } = useButton(calendarButtonProps, buttonRef);

  const baseInputClassName = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed";
  const finalClassName = `${baseInputClassName} ${className}`;

  // Handle text input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const parsedDate = parseDateFromInput(inputValue);
    
    if (parsedDate || inputValue === '') {
      onChange?.(parsedDate);
    }
  };

  // Handle keyboard navigation in input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isDisabled) return;

    const currentDate = value || new Date();
    let newDate: Date | null = null;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (e.altKey || e.metaKey) {
          // Open calendar
          state.setOpen(true);
          return;
        }
        newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() - 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + 1);
        break;
      case 'Enter':
        e.preventDefault();
        state.setOpen(true);
        return;
      case 'Escape':
        if (state.isOpen) {
          e.preventDefault();
          state.setOpen(false);
        }
        return;
    }

    if (newDate) {
      // Validate against min/max values
      if (minValue && newDate < minValue) return;
      if (maxValue && newDate > maxValue) return;
      onChange?.(newDate);
    }
  };

  return (
    <OverlayProvider>
      <div className="relative">
      <div {...groupProps} ref={ref} className="flex">
        <input

          type="text"
          id={id}
          name={name}
          value={formatDateForInput(value ?? null)}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          pattern="\d{4}-\d{2}-\d{2}"
          className={finalClassName}
          disabled={isDisabled}
          required={required}
          aria-label={ariaLabel || `Date input, ${placeholder} format`}
          aria-describedby={ariaDescribedBy}
        />
        <button
          {...buttonProps}
          ref={buttonRef}
          className="ml-1 px-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-600 hover:bg-gray-100 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isDisabled}
          aria-label="Open calendar"
        >
          📅
        </button>
      </div>

      {/* Hidden input for form submission */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={formatDateForInput(value ?? null)}
        />
      )}

      {state.isOpen && (
        <CalendarPopover
          state={state}
          dialogProps={dialogProps}
          calendarProps={calendarProps}
        />
      )}
    </div>
    </OverlayProvider>
  );
}

interface CalendarPopoverProps {
  state: ReturnType<typeof useDatePickerState>;
  dialogProps: AriaDialogProps;
  calendarProps: AriaCalendarProps<DateValue>;
}

function CalendarPopover({ state, dialogProps, calendarProps }: CalendarPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { overlayProps, underlayProps } = useOverlay(
    {
      onClose: () => state.setOpen(false),
      isOpen: true,
      isDismissable: true
    },
    ref
  );

  const { modalProps } = useModal();
  const { dialogProps: ariaDialogProps } = useDialog(dialogProps, ref);

  return (
    <div {...underlayProps} className="fixed inset-0 z-50 bg-black bg-opacity-25 flex items-center justify-center">
      <div
        {...overlayProps}
        {...modalProps}
        {...ariaDialogProps}
        ref={ref}
        className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-4 max-w-sm w-full mx-4"
      >
        <DismissButton onDismiss={() => state.setOpen(false)} />
        <Calendar {...calendarProps} value={state.value} onChange={state.setValue} />
        <DismissButton onDismiss={() => state.setOpen(false)} />
      </div>
    </div>
  );
}

interface CalendarProps {
  value?: DateValue | null;
  onChange?: (value: DateValue | null) => void;
  [key: string]: unknown;
}

function Calendar(props: CalendarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useCalendarState({ 
    ...props, 
    locale: 'en-US', 
    createCalendar,
    value: props.value || null
  });
  const { calendarProps, prevButtonProps, nextButtonProps, title } = useCalendar(props, state);

  return (
    <div {...calendarProps} ref={ref} className="text-center">
      <div className="flex items-center justify-between mb-4">
        <button
          {...prevButtonProps}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          ◀
        </button>
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        <button
          {...nextButtonProps}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          ▶
        </button>
      </div>
      <CalendarGrid state={state} />
    </div>
  );
}

interface CalendarGridProps {
  state: ReturnType<typeof useCalendarState>;
}

function CalendarGrid({ state }: CalendarGridProps) {
  const ref = useRef<HTMLTableElement>(null);
  const { gridProps, headerProps, weekDays } = useCalendarGrid({}, state);

  return (
    <table {...gridProps} ref={ref} className="w-full">
      <thead {...headerProps}>
        <tr>
          {weekDays.map((day, index) => (
            <th key={index} className="text-xs font-medium text-gray-500 dark:text-gray-400 p-2">
              {day}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 6 }, (_, weekIndex) => (
          <tr key={weekIndex}>
            {state.getDatesInWeek(weekIndex, state.visibleRange.start).map((date: CalendarDate | null, i: number) => (
              date ? (
                <CalendarCell key={i} state={state} date={date} />
              ) : (
                <td key={i} />
              )
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface CalendarCellProps {
  state: ReturnType<typeof useCalendarState>;
  date: CalendarDate;
}

function CalendarCell({ state, date }: CalendarCellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { cellProps, buttonProps, isSelected, isOutsideVisibleRange, isDisabled, formattedDate } = useCalendarCell(
    { date },
    state,
    ref
  );

  const { focusProps, isFocusVisible } = useFocusRing();

  return (
    <td {...cellProps} className="p-1">
      <div
        {...buttonProps}
        {...focusProps}
        ref={ref}
        className={`
          w-8 h-8 flex items-center justify-center text-sm rounded cursor-pointer
          ${isSelected ? 'bg-blue-500 text-white' : 'text-gray-900 dark:text-gray-100'}
          ${isDisabled ? 'text-gray-400 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}
          ${isOutsideVisibleRange ? 'text-gray-400' : ''}
          ${isFocusVisible ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        `}
      >
        {formattedDate}
      </div>
    </td>
  );
}