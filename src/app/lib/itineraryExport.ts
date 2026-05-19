type LocationTimingExportInput = {
  arrivalTime?: string | null;
  departureTime?: string | null;
  startDay: string;
  endDay: string;
};

const isDateOnlyValue = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

const isTimeOfDayValue = (value: string): boolean => value.includes(':');

const shouldIncludeTimingValue = (value: string, redundantDate: string): boolean => {
  if (!value) {
    return false;
  }

  if (isTimeOfDayValue(value)) {
    return true;
  }

  if (isDateOnlyValue(value)) {
    return value !== redundantDate;
  }

  return true;
};

export function formatLocationTimingForExport({
  arrivalTime,
  departureTime,
  startDay,
  endDay
}: LocationTimingExportInput): string {
  const arrivalValue = arrivalTime || '';
  const departureValue = departureTime || '';

  return [
    shouldIncludeTimingValue(arrivalValue, startDay) ? `arrive ${arrivalValue}` : null,
    shouldIncludeTimingValue(departureValue, endDay) ? `depart ${departureValue}` : null
  ].filter(Boolean).join(' / ');
}
