import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import MultiRouteLinkManager from '@/app/admin/components/MultiRouteLinkManager';
import { TravelLinkInfo } from '@/app/lib/expenseTravelLookup';

// Mock TravelItemSelector since it has its own tests
jest.mock('../TravelItemSelector', () => ({
  __esModule: true,
  default: ({ onReferenceChange }: { onReferenceChange: (link: TravelLinkInfo | undefined) => void }) => (
    <button
      data-testid="mock-travel-selector"
      onClick={() => onReferenceChange({
        id: 'route-new',
        type: 'route',
        name: 'New Route'
      })}
    >
      Select Travel Item
    </button>
  ),
}));

// Mock AriaSelect
jest.mock('../AriaSelect', () => ({
  __esModule: true,
  default: ({ value, onChange, options }: { 
    value: string; 
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
    <select
      data-testid="split-mode-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  ),
}));

describe('MultiRouteLinkManager', () => {
  const defaultProps = {
    expenseId: 'expense-1',
    tripId: 'trip-1',
    expenseAmount: 100,
    expenseCurrency: 'EUR',
    onLinksChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('renders with empty links and shows add button', () => {
      render(<MultiRouteLinkManager {...defaultProps} />);
      
      expect(screen.getByText('+ Add route or segment')).toBeInTheDocument();
      expect(screen.queryByText(/Linked Routes/)).not.toBeInTheDocument();
    });

    it('initializes with provided links', () => {
      const initialLinks: TravelLinkInfo[] = [
        { id: 'route-1', type: 'route', name: 'Paris → London' },
        { id: 'route-2', type: 'route', name: 'London → Edinburgh' },
      ];

      render(<MultiRouteLinkManager {...defaultProps} initialLinks={initialLinks} />);
      
      expect(screen.getByText('Paris → London')).toBeInTheDocument();
      expect(screen.getByText('London → Edinburgh')).toBeInTheDocument();
      expect(screen.getByText('Linked Routes (2)')).toBeInTheDocument();
    });

    it('detects split mode from initial links', () => {
      const initialLinks: TravelLinkInfo[] = [
        { id: 'route-1', type: 'route', name: 'Route 1', splitMode: 'percentage', splitValue: 60 },
        { id: 'route-2', type: 'route', name: 'Route 2', splitMode: 'percentage', splitValue: 40 },
      ];

      render(<MultiRouteLinkManager {...defaultProps} initialLinks={initialLinks} />);
      
      const select = screen.getByTestId('split-mode-select') as HTMLSelectElement;
      expect(select.value).toBe('percentage');
    });
  });

  describe('adding links', () => {
    it('shows travel selector when add button is clicked', async () => {
      const user = userEvent.setup();
      render(<MultiRouteLinkManager {...defaultProps} />);
      
      await user.click(screen.getByText('+ Add route or segment'));
      
      expect(screen.getByTestId('mock-travel-selector')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('adds new link when travel item is selected', async () => {
      const user = userEvent.setup();
      const onLinksChange = jest.fn();
      render(<MultiRouteLinkManager {...defaultProps} onLinksChange={onLinksChange} />);
      
      await user.click(screen.getByText('+ Add route or segment'));
      await user.click(screen.getByTestId('mock-travel-selector'));
      
      await waitFor(() => {
        expect(screen.getByText('New Route')).toBeInTheDocument();
      });
    });

    it('prevents adding duplicate links', async () => {
      const user = userEvent.setup();
      const initialLinks: TravelLinkInfo[] = [
        { id: 'route-new', type: 'route', name: 'New Route' },
      ];
      
      render(<MultiRouteLinkManager {...defaultProps} initialLinks={initialLinks} />);
      
      await user.click(screen.getByText('+ Add route or segment'));
      await user.click(screen.getByTestId('mock-travel-selector'));
      
      await waitFor(() => {
        expect(screen.getByText(/This route is already added to the list/)).toBeInTheDocument();
      });
    });
  });

  describe('removing links', () => {
    it('removes link when remove button is clicked', async () => {
      const user = userEvent.setup();
      const onLinksChange = jest.fn();
      const initialLinks: TravelLinkInfo[] = [
        { id: 'route-1', type: 'route', name: 'Route to Remove' },
        { id: 'route-2', type: 'route', name: 'Route to Keep' },
      ];
      
      render(
        <MultiRouteLinkManager 
          {...defaultProps} 
          initialLinks={initialLinks} 
          onLinksChange={onLinksChange}
        />
      );
      
      // Find the remove button for the first route
      const removeButtons = screen.getAllByTitle('Remove link');
      await user.click(removeButtons[0]);
      
      await waitFor(() => {
        expect(screen.queryByText('Route to Remove')).not.toBeInTheDocument();
        expect(screen.getByText('Route to Keep')).toBeInTheDocument();
      });
    });
  });

  describe('split mode changes', () => {
    it('changes split mode when selector is changed', async () => {
      const user = userEvent.setup();
      const initialLinks: TravelLinkInfo[] = [
        { id: 'route-1', type: 'route', name: 'Route 1' },
        { id: 'route-2', type: 'route', name: 'Route 2' },
      ];
      
      render(<MultiRouteLinkManager {...defaultProps} initialLinks={initialLinks} />);
      
      const select = screen.getByTestId('split-mode-select');
      await user.selectOptions(select, 'percentage');
      
      expect((select as HTMLSelectElement).value).toBe('percentage');
    });

    it('shows distribute equally button for percentage mode', async () => {
      const user = userEvent.setup();
      const initialLinks: TravelLinkInfo[] = [
        { id: 'route-1', type: 'route', name: 'Route 1' },
        { id: 'route-2', type: 'route', name: 'Route 2' },
      ];
      
      render(<MultiRouteLinkManager {...defaultProps} initialLinks={initialLinks} />);
      
      const select = screen.getByTestId('split-mode-select');
      await user.selectOptions(select, 'percentage');
      
      expect(screen.getByText('Distribute equally')).toBeInTheDocument();
    });
  });

  describe('validation', () => {
    it('shows valid state with correct equal split', () => {
      const initialLinks: TravelLinkInfo[] = [
        { id: 'route-1', type: 'route', name: 'Route 1' },
        { id: 'route-2', type: 'route', name: 'Route 2' },
      ];
      
      render(<MultiRouteLinkManager {...defaultProps} initialLinks={initialLinks} />);
      
      // Should show success message (equal split is always valid)
      expect(screen.getByText(/Expense of 100\.00 EUR split across 2 routes/)).toBeInTheDocument();
    });
  });

  describe('state management (infinite loop prevention)', () => {
    it('does not cause infinite re-renders when onLinksChange updates parent', async () => {
      const renderCount = { current: 0 };
      const onLinksChange = jest.fn(() => {
        renderCount.current++;
      });
      
      const initialLinks: TravelLinkInfo[] = [
        { id: 'route-1', type: 'route', name: 'Route 1' },
      ];
      
      render(
        <MultiRouteLinkManager 
          {...defaultProps} 
          initialLinks={initialLinks}
          onLinksChange={onLinksChange}
        />
      );
      
      // Wait for initial render cycle to complete
      await waitFor(() => {
        expect(onLinksChange).toHaveBeenCalled();
      });
      
      // Should not have excessive calls (infinite loop would cause many calls)
      expect(onLinksChange.mock.calls.length).toBeLessThan(5);
    });

    it('preserves user edits when parent re-renders with same expense', async () => {
      const user = userEvent.setup();
      const onLinksChange = jest.fn();
      
      const initialLinks: TravelLinkInfo[] = [
        { id: 'route-1', type: 'route', name: 'Route 1' },
      ];
      
      const { rerender } = render(
        <MultiRouteLinkManager 
          {...defaultProps}
          expenseId="expense-1"
          initialLinks={initialLinks}
          onLinksChange={onLinksChange}
        />
      );
      
      // Add a new link
      await user.click(screen.getByText('+ Add route or segment'));
      await user.click(screen.getByTestId('mock-travel-selector'));
      
      await waitFor(() => {
        expect(screen.getByText('New Route')).toBeInTheDocument();
      });
      
      // Simulate parent re-render with same expense but original initialLinks
      rerender(
        <MultiRouteLinkManager 
          {...defaultProps}
          expenseId="expense-1"
          initialLinks={initialLinks}
          onLinksChange={onLinksChange}
        />
      );
      
      // User's added route should still be there
      expect(screen.getByText('New Route')).toBeInTheDocument();
    });

    it('resets state when switching to different expense', async () => {
      const onLinksChange = jest.fn();
      
      const initialLinks: TravelLinkInfo[] = [
        { id: 'route-1', type: 'route', name: 'Expense 1 Route' },
      ];
      
      const { rerender } = render(
        <MultiRouteLinkManager 
          {...defaultProps}
          expenseId="expense-1"
          initialLinks={initialLinks}
          onLinksChange={onLinksChange}
        />
      );
      
      expect(screen.getByText('Expense 1 Route')).toBeInTheDocument();
      
      // Switch to different expense with different links
      const newLinks: TravelLinkInfo[] = [
        { id: 'route-2', type: 'route', name: 'Expense 2 Route' },
      ];
      
      rerender(
        <MultiRouteLinkManager 
          {...defaultProps}
          expenseId="expense-2"
          initialLinks={newLinks}
          onLinksChange={onLinksChange}
        />
      );
      
      // Should now show the new expense's links
      await waitFor(() => {
        expect(screen.queryByText('Expense 1 Route')).not.toBeInTheDocument();
        expect(screen.getByText('Expense 2 Route')).toBeInTheDocument();
      });
    });
  });
});
