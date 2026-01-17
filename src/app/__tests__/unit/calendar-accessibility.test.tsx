import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CalendarGrid from '@/app/components/TripCalendar/CalendarGrid';
import type { MonthCalendar, CalendarCell } from '@/app/lib/calendarUtils';

function makeDate(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day);
}

function makeCell(date: Date, overrides: Partial<CalendarCell['day']> = {}): CalendarCell {
  return {
    day: {
      date,
      locations: [],
      primaryLocation: { id: `loc-${date.getTime()}`, name: 'London', coordinates: [0, 0], date },
      cellType: 'single',
      ...overrides,
    },
    backgroundColor: '#ffffff',
    textColor: '#000000',
  };
}

describe('Trip calendar accessibility', () => {
  it('renders a grid with focusable gridcells and meaningful labels', () => {
    const month: MonthCalendar = {
      month: makeDate(2024, 0, 1),
      weeks: [
        [
          makeCell(makeDate(2024, 0, 1)),
          makeCell(makeDate(2024, 0, 2)),
          makeCell(makeDate(2024, 0, 3)),
          makeCell(makeDate(2024, 0, 4)),
          makeCell(makeDate(2024, 0, 5)),
          makeCell(makeDate(2024, 0, 6)),
          makeCell(makeDate(2024, 0, 7)),
        ],
      ],
    };

    render(
      <div>
        <h3 id="month-header">January 2024</h3>
        <CalendarGrid
          monthCalendar={month}
          selectedDate={makeDate(2024, 0, 3)}
          onLocationSelect={() => {}}
          locationColors={new Map()}
          monthHeaderId="month-header"
          onAnnounce={() => {}}
        />
      </div>
    );

    expect(screen.getByRole('grid', { name: 'January 2024' })).toBeInTheDocument();
    const cells = screen.getAllByRole('gridcell');
    expect(cells.length).toBeGreaterThan(0);
    const focusableCells = cells.filter(cell => cell.getAttribute('tabindex') === '0');
    expect(focusableCells).toHaveLength(cells.length);
    const selectedCell = screen.getByRole('gridcell', { name: /january 3, 2024/i });
    expect(selectedCell).toHaveAttribute('tabindex', '0');
    expect(selectedCell).toHaveAttribute('aria-label');
  });

  it('supports arrow key navigation between gridcells', () => {
    const month: MonthCalendar = {
      month: makeDate(2024, 0, 1),
      weeks: [[makeCell(makeDate(2024, 0, 1)), makeCell(makeDate(2024, 0, 2)), makeCell(makeDate(2024, 0, 3)), makeCell(makeDate(2024, 0, 4)), makeCell(makeDate(2024, 0, 5)), makeCell(makeDate(2024, 0, 6)), makeCell(makeDate(2024, 0, 7))]],
    };

    render(
      <div>
        <h3 id="month-header">January 2024</h3>
        <CalendarGrid
          monthCalendar={month}
          selectedDate={null}
          onLocationSelect={() => {}}
          locationColors={new Map()}
          monthHeaderId="month-header"
          onAnnounce={() => {}}
        />
      </div>
    );

    const cells = screen.getAllByRole('gridcell');
    expect(cells.every(cell => cell.getAttribute('tabindex') === '0')).toBe(true);
    act(() => {
      cells[0].focus();
    });
    expect(document.activeElement).toBe(cells[0]);

    fireEvent.keyDown(cells[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cells[1]);

    fireEvent.keyDown(cells[1], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(cells[0]);
  });
});
