'use client';

import React, { useRef } from 'react';
import { useDatePicker, useDateField, useDateSegment } from '@react-aria/datepicker';
import { useDatePickerState, useDateFieldState, type DateFieldState } from '@react-stately/datepicker';
import { useOverlay, useModal, DismissButton, OverlayProvider } from '@react-aria/overlays';
import { FocusScope } from '@react-aria/focus';
import { useButton } from '@react-aria/button';
import { useLocale } from '@react-aria/i18n';
import { CalendarDate, createCalendar } from '@internationalized/date';
import { useCalendar, useCalendarGrid, useCalendarCell, type AriaCalendarProps } from '@react-aria/calendar';
import { useCalendarState, type CalendarState } from '@react-stately/calendar';
import type { DateValue } from '@internationalized/date';
import type { AriaButtonProps } from '@react-aria/button';
import type { AriaDateFieldProps } from '@react-aria/datepicker';
import type { AriaDialogProps } from '@react-aria/dialog';
import type { DateSegment as AriaDateSegment } from '@react-stately/datepicker';

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
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

// Utility functions for date conversion
function dateToCalendarDate(date: Date | null | undefined): CalendarDate | undefined {
  if (!date) return undefined;
  return new CalendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function calendarDateToDate(calendarDate: CalendarDate | null): Date | null {
  if (!calendarDate) return null;
  return new Date(Date.UTC(calendarDate.year, calendarDate.month - 1, calendarDate.day));
}

function formatDateForInput(date: Date | null | undefined): string {
  if (!date) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function AccessibleDatePicker({
  id,
  name,
  value,
  defaultValue,
  onChange,
  required = false,
  className = '',
  placeholder = 'Select date',
  minValue,
  maxValue,
  isDisabled = false,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy
}: AccessibleDatePickerProps) {
  useLocale();

  const state = useDatePickerState({
    value: dateToCalendarDate(value ?? undefined),
    defaultValue: dateToCalendarDate(defaultValue ?? undefined),
    minValue: dateToCalendarDate(minValue ?? undefined),
    maxValue: dateToCalendarDate(maxValue ?? undefined),
    isDisabled,
    shouldCloseOnSelect: true,
    onChange: (newVal: DateValue | null) => {
      onChange?.(calendarDateToDate(newVal as CalendarDate | null));
    }
  });

  const groupRef = useRef<HTMLDivElement>(null);
  const { groupProps, fieldProps, buttonProps, dialogProps, calendarProps } = useDatePicker(
    {
      id,
      'aria-label': ariaLabelledBy ? undefined : (ariaLabel || placeholder),
      'aria-labelledby': ariaLabelledBy,
      'aria-describedby': ariaDescribedBy,
      isRequired: required,
      isDisabled
    },
    state,
    groupRef
  );

  return (
    <OverlayProvider>
      <div className="relative">
        <div {...groupProps} aria-required={required || undefined} ref={groupRef} className="flex items-stretch">
          <DateField
            {...fieldProps}
            id={id}
            isDisabled={isDisabled}
            isRequired={required}
            className={`flex-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus-within:ring-2 focus-within:ring-blue-500 dark:bg-gray-700 dark:text-white ${className}`}
          />
          <CalendarButton buttonProps={buttonProps} isDisabled={isDisabled} />
        </div>

        {/* Hidden input for form submission */}
        {name && (
          <input type="hidden" name={name} value={formatDateForInput(calendarDateToDate(state.value as CalendarDate | null) ?? value ?? undefined)} />
        )}

        {state.isOpen && (
          <Popover onClose={() => state.setOpen(false)}>
            <DialogContainer dialogProps={dialogProps}>
              <Calendar {...calendarProps} />
            </DialogContainer>
          </Popover>
        )}
      </div>
    </OverlayProvider>
  );
}

function CalendarButton({ buttonProps, isDisabled }: { buttonProps: AriaButtonProps; isDisabled?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps: ariaButtonProps } = useButton(buttonProps, ref);
  return (
    <button
      {...ariaButtonProps}
      ref={ref}
      type="button"
      className="ml-2 px-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-600 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label="Open calendar"
      disabled={isDisabled}
    >
      📅
    </button>
  );
}

function DateField(props: AriaDateFieldProps<DateValue> & { className?: string; id?: string }) {
  const { locale } = useLocale();
  const state = useDateFieldState({
    ...props,
    locale,
    createCalendar,
    granularity: 'day'
  });

  const ref = useRef<HTMLDivElement>(null);
  const { fieldProps } = useDateField(props, state, ref);

  return (
    <div {...fieldProps} ref={ref} className={props.className}>
      <div className="flex gap-1 items-center">
        {state.segments.map((segment, i) => (
          <DateSegment key={i} segment={segment} state={state} />)
        )}
      </div>
    </div>
  );
}

function DateSegment({ segment, state }: { segment: AriaDateSegment; state: DateFieldState }) {
  const ref = useRef<HTMLDivElement>(null);
  const { segmentProps } = useDateSegment(segment, state, ref);
  const isPlaceholder = segment.isPlaceholder;
  return (
    <div
      {...segmentProps}
      ref={ref}
      className={`px-1 rounded outline-none focus:ring-2 focus:ring-blue-500 ${
        isPlaceholder ? 'text-gray-400' : 'text-gray-900 dark:text-white'
      }`}
    >
      {segment.text}
    </div>
  );
}

function Popover({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { overlayProps, underlayProps } = useOverlay(
    { isOpen: true, isDismissable: true, onClose },
    ref
  );
  const { modalProps } = useModal();

  return (
    <div {...underlayProps} className="fixed inset-0 z-50 bg-black/25 flex items-center justify-center">
      <FocusScope restoreFocus>
        <div
          {...overlayProps}
          {...modalProps}
          ref={ref}
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3 w-[20rem] max-w-[95vw]"
        >
          <DismissButton onDismiss={onClose} />
          {children}
          <DismissButton onDismiss={onClose} />
        </div>
      </FocusScope>
    </div>
  );
}

function DialogContainer({ children, dialogProps }: { children: React.ReactNode; dialogProps: AriaDialogProps }) {
  return (
    <div {...dialogProps} role="dialog" aria-modal="true">
      {children}
    </div>
  );
}

function Calendar(props: AriaCalendarProps<DateValue>) {
  const { locale } = useLocale();
  const state = useCalendarState({ ...props, locale, createCalendar });
  const ref = useRef<HTMLDivElement>(null);
  const { calendarProps, prevButtonProps, nextButtonProps, title } = useCalendar(props, state);

  return (
    <div {...calendarProps} ref={ref} className="text-center">
      <div className="flex items-center justify-between mb-2">
        <NavButton {...prevButtonProps}>◀</NavButton>
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        <NavButton {...nextButtonProps}>▶</NavButton>
      </div>
      <CalendarGrid state={state} />
    </div>
  );
}

function NavButton(props: AriaButtonProps & { children: React.ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(props, ref);
  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {props.children}
    </button>
  );
}

function CalendarGrid({ state }: { state: CalendarState }) {
  const { locale } = useLocale();
  const { gridProps, headerProps } = useCalendarGrid({}, state);

  // Build a 6x7 grid of dates covering the visible month, aligned to Sundays (weekDays starts with Sunday)
  const start = state.visibleRange.start as CalendarDate; // first day of visible month
  const jsStartOfMonth = new Date(start.year, start.month - 1, 1);
  // Compute offset for Monday-first grid (Mon=0 ... Sun=6)
  const offset = (jsStartOfMonth.getDay() + 6) % 7; // JS getDay(): Sun=0
  const jsGridStart = new Date(start.year, start.month - 1, 1 - offset);

  const weeks: CalendarDate[][] = Array.from({ length: 6 }, (_, weekIdx) => {
    return Array.from({ length: 7 }, (_, dayIdx) => {
      const d = new Date(jsGridStart);
      d.setDate(d.getDate() + weekIdx * 7 + dayIdx);
      return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
    });
  });

  // Build Monday-first weekday headers using locale
  const baseMonday = new Date(2021, 0, 4); // 2021-01-04 is a Monday
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(baseMonday);
    d.setDate(baseMonday.getDate() + i);
    return weekdayFormatter.format(d);
  });

  return (
    <table {...gridProps} className="w-full">
      <thead {...headerProps}>
        <tr>
          {weekDays.map((day, i) => (
            <th key={i} className="text-xs font-medium text-gray-500 dark:text-gray-400 p-1">
              {day}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week, i) => (
          <tr key={i}>
            {week.map((date, j) => (
              date ? (
                <CalendarCellInner key={j} state={state} date={date} />
              ) : (
                <CalendarCellEmpty key={j} />
              )
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CalendarCellEmpty() {
  return <td className="p-0.5"><div className="w-8 h-8" /></td>;
}

function CalendarCellInner({ state, date }: { state: CalendarState; date: CalendarDate }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { cellProps, buttonProps, isSelected, isOutsideVisibleRange, isDisabled, formattedDate } = useCalendarCell({ date }, state, ref);
  return (
    <td {...cellProps} className="p-0.5">
      <button
        {...buttonProps}
        ref={ref}
        type="button"
        disabled={isDisabled}
        className={`w-8 h-8 flex items-center justify-center text-sm rounded focus:outline-none focus:ring-2 focus:ring-blue-500
          ${isSelected ? 'bg-blue-500 text-white' : 'text-gray-900 dark:text-gray-100'}
          ${isOutsideVisibleRange ? 'text-gray-400' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
      >
        {formattedDate}
      </button>
    </td>
  );
}
