const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function toLocalDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

function isUtcMidnight(date: Date): boolean {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

/**
 * Normalize a date-like value to a local calendar day.
 * Date-only strings and legacy UTC-midnight timestamps are interpreted as calendar dates.
 */
export function parseDateAsLocalDay(value: Date | string | undefined | null): Date | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof Date) {
    if (!isValidDate(value)) {
      return null;
    }
    if (isUtcMidnight(value)) {
      return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    }
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const dateOnlyMatch = trimmed.match(DATE_ONLY_PATTERN);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    const localDate = toLocalDate(year, month, day);
    return isValidDate(localDate) ? localDate : null;
  }

  const parsed = new Date(trimmed);
  if (!isValidDate(parsed)) {
    return null;
  }

  if (isUtcMidnight(parsed)) {
    return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function getTodayLocalDay(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function formatLocalDateInput(value: Date | string | undefined | null): string {
  const localDay = parseDateAsLocalDay(value);
  if (!localDay) {
    return '';
  }

  const year = localDay.getFullYear();
  const month = String(localDay.getMonth() + 1).padStart(2, '0');
  const day = String(localDay.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getLocalDateSortValue(value: Date | string | undefined | null): number {
  const localDay = parseDateAsLocalDay(value);
  return localDay ? localDay.getTime() : Number.MAX_SAFE_INTEGER;
}

export function formatLocalDateLabel(
  value: Date | string | undefined | null,
  locales: Intl.LocalesArgument = 'en-GB',
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }
): string {
  const localDay = parseDateAsLocalDay(value);
  if (!localDay) {
    return 'Invalid Date';
  }

  return localDay.toLocaleDateString(locales, options);
}
