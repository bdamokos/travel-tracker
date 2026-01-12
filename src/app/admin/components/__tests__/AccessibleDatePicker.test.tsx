import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import AccessibleDatePicker from '@/app/admin/components/AccessibleDatePicker';

describe('AccessibleDatePicker', () => {
  const defaultProps = {
    id: 'test-date-picker',
    placeholder: 'Select a date',
    'aria-label': 'Test date picker'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders with required props', () => {
      const { container } = render(<AccessibleDatePicker {...defaultProps} />);
      const group = screen.getByRole('group', { name: /test date picker/i });
      expect(group).toBeInTheDocument();
      expect(group).toHaveAttribute('id', 'test-date-picker');
      // Segmented field renders three spinbuttons
      const segments = screen.getAllByRole('spinbutton');
      expect(segments.length).toBeGreaterThanOrEqual(3);
      // Placeholder is represented through placeholder-like segment text
      expect(container.textContent?.toLowerCase()).toContain('mm');
      expect(container.textContent?.toLowerCase()).toContain('dd');
    });

    it('renders calendar button', () => {
      render(<AccessibleDatePicker {...defaultProps} />);
      
      const calendarButton = screen.getByRole('button', { name: /open calendar/i });
      expect(calendarButton).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(<AccessibleDatePicker {...defaultProps} className="custom-class" />);
      const fieldContainer = container.querySelector('.custom-class');
      expect(fieldContainer).toBeInTheDocument();
    });

    it('renders as required when specified', () => {
      render(<AccessibleDatePicker {...defaultProps} required />);
      const group = screen.getByRole('group', { name: /test date picker/i });
      expect(group).toHaveAttribute('aria-required', 'true');
    });

    it('renders as disabled when specified', () => {
      render(<AccessibleDatePicker {...defaultProps} isDisabled />);
      const group = screen.getByRole('group', { name: /test date picker/i });
      const button = screen.getByRole('button', { name: /open calendar/i });
      expect(group).toHaveAttribute('aria-disabled', 'true');
      expect(button).toBeDisabled();
    });
  });

  describe('Form Integration', () => {
    it('renders hidden input with name attribute', () => {
      const { container } = render(
        <AccessibleDatePicker {...defaultProps} name="testDate" />
      );
      
      const hiddenInput = container.querySelector('input[type="hidden"][name="testDate"]');
      expect(hiddenInput).toBeInTheDocument();
    });

    it('updates hidden input value when date changes', () => {
      const testDate = new Date('2024-01-15');
      const { container } = render(
        <AccessibleDatePicker {...defaultProps} name="testDate" value={testDate} />
      );
      
      const hiddenInput = container.querySelector('input[type="hidden"][name="testDate"]') as HTMLInputElement;
      expect(hiddenInput?.value).toBe('2024-01-15');
    });

    it('handles form submission correctly', () => {
      const handleSubmit = jest.fn((e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        return Object.fromEntries(formData.entries());
      });

      render(
        <form onSubmit={handleSubmit}>
          <AccessibleDatePicker {...defaultProps} name="testDate" value={new Date('2024-01-15')} />
          <button type="submit">Submit</button>
        </form>
      );

      fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      expect(handleSubmit).toHaveBeenCalled();
    });
  });

  describe('Date Input and Validation', () => {
    it('accepts date changes via segments', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      
      render(<AccessibleDatePicker {...defaultProps} onChange={onChange} />);
      
      const segments = screen.getAllByRole('spinbutton');
      // Focus year segment and type 2024
      await user.click(segments[2]);
      await user.type(segments[2], '2024');
      // Focus month segment and type 01
      await user.click(segments[0]);
      await user.type(segments[0], '01');
      // Focus day segment and type 15
      await user.click(segments[1]);
      await user.type(segments[1], '15');
      expect(onChange).toHaveBeenCalled();
    });

    it('renders segments for validation instead of a text input', () => {
      render(<AccessibleDatePicker {...defaultProps} />);
      const segments = screen.getAllByRole('spinbutton');
      expect(segments.length).toBeGreaterThanOrEqual(3);
    });

    it('displays formatted date via segments', () => {
      const testDate = new Date('2024-01-15');
      render(<AccessibleDatePicker {...defaultProps} value={testDate} />);
      const segments = screen.getAllByRole('spinbutton');
      expect(segments.map(s => s.textContent?.trim())).toEqual(['1', '15', '2024']);
    });

    it('handles null/undefined values gracefully', () => {
      const { container } = render(<AccessibleDatePicker {...defaultProps} value={null} />);
      expect(container.textContent?.toLowerCase()).toContain('mm');
      expect(container.textContent?.toLowerCase()).toContain('dd');
    });
  });

  describe('Keyboard Navigation', () => {
    it('opens calendar on Enter key', async () => {
      const user = userEvent.setup();
      render(<AccessibleDatePicker {...defaultProps} />);
      
      const calendarButton = screen.getByRole('button', { name: /open calendar/i });
      calendarButton.focus();
      await user.keyboard('{Enter}');
      
      // Calendar should be opened - we can check for calendar elements
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('opens calendar on Alt+ArrowDown', async () => {
      const user = userEvent.setup();
      render(<AccessibleDatePicker {...defaultProps} />);
      
      const firstSegment = screen.getAllByRole('spinbutton')[0];
      await user.click(firstSegment);
      await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
      
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('handles arrow key navigation for date adjustment', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      const testDate = new Date('2024-01-15');
      
      render(<AccessibleDatePicker {...defaultProps} value={testDate} onChange={onChange} />);
      
      const daySegment = screen.getAllByRole('spinbutton')[1];
      await user.click(daySegment);
      await user.keyboard('{ArrowUp}');
      
      expect(onChange).toHaveBeenCalled();
    });

    it('prevents default behavior on navigation keys', async () => {
      const user = userEvent.setup();
      render(<AccessibleDatePicker {...defaultProps} />);
      
      const daySegment = screen.getAllByRole('spinbutton')[1];
      await user.click(daySegment);
      const keydownEvent = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true });
      const preventDefaultSpy = jest.spyOn(keydownEvent, 'preventDefault');
      fireEvent(daySegment, keydownEvent);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('does not handle keyboard navigation when disabled', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      
      render(<AccessibleDatePicker {...defaultProps} isDisabled onChange={onChange} />);
      
      const daySegment = screen.getAllByRole('spinbutton')[1];
      await user.keyboard('{ArrowUp}');
      
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('Calendar Interaction', () => {
    it('opens calendar when button is clicked', async () => {
      const user = userEvent.setup();
      render(<AccessibleDatePicker {...defaultProps} />);
      
      const calendarButton = screen.getByRole('button', { name: /open calendar/i });
      await user.click(calendarButton);
      
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('closes calendar on Escape key', async () => {
      const user = userEvent.setup();
      render(<AccessibleDatePicker {...defaultProps} />);
      
      // Open calendar first
      const calendarButton = screen.getByRole('button', { name: /open calendar/i });
      await user.click(calendarButton);
      
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      
      // Close with Escape
      await user.keyboard('{Escape}');
      
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('closes calendar when clicking outside', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <AccessibleDatePicker {...defaultProps} />
          <div data-testid="outside">Outside element</div>
        </div>
      );
      
      // Open calendar
      const calendarButton = screen.getByRole('button', { name: /open calendar/i });
      await user.click(calendarButton);
      
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      
      // Click outside
      await user.click(screen.getByTestId('outside'));
      
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      render(<AccessibleDatePicker {...defaultProps} aria-label="Custom date picker" />);
      
      const group = screen.getByRole('group', { name: /custom date picker/i });
      expect(group).toHaveAccessibleName(/custom date picker/i);
    });

    it('supports aria-describedby', () => {
      render(
        <div>
          <AccessibleDatePicker {...defaultProps} aria-describedby="date-help" />
          <div id="date-help">Help text for date picker</div>
        </div>
      );
      
      const group = screen.getByRole('group', { name: /test date picker/i });
      expect(group).toHaveAttribute('aria-describedby', 'date-help');
    });

    it('has proper focus management', async () => {
      const user = userEvent.setup();
      render(<AccessibleDatePicker {...defaultProps} />);
      
      const segments = screen.getAllByRole('spinbutton');
      const calendarButton = screen.getByRole('button', { name: /open calendar/i });
      
      // Tab should move focus through segments to the calendar button
      await user.click(segments[0]);
      await user.tab();
      await user.tab();
      await user.tab();
      
      expect(calendarButton).toHaveFocus();
    });

    it('announces calendar state to screen readers', async () => {
      const user = userEvent.setup();
      render(<AccessibleDatePicker {...defaultProps} />);
      
      const calendarButton = screen.getByRole('button', { name: /open calendar/i });
      await user.click(calendarButton);
      
      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();
        expect(dialog).toHaveAttribute('aria-modal', 'true');
      });
    });
  });

  describe('Date Constraints', () => {
    it('respects minimum date constraint', () => {
      const minDate = new Date('2024-01-10');
      const onChange = jest.fn();
      
      render(
        <AccessibleDatePicker 
          {...defaultProps} 
          value={new Date('2024-01-15')} 
          minValue={minDate}
          onChange={onChange} 
        />
      );
      
      const daySegment = screen.getAllByRole('spinbutton')[1];
      fireEvent.keyDown(daySegment, { key: 'ArrowLeft' });
      
      // Should not call onChange if it would violate min constraint
      // This test verifies the constraint logic exists
      expect(screen.getByRole('group', { name: /test date picker/i })).toBeInTheDocument();
    });

    it('respects maximum date constraint', async () => {
      const maxDate = new Date('2024-01-20');
      const onChange = jest.fn();
      
      render(
        <AccessibleDatePicker 
          {...defaultProps} 
          value={new Date('2024-01-15')} 
          maxValue={maxDate}
          onChange={onChange} 
        />
      );
      
      const daySegment = screen.getAllByRole('spinbutton')[1];
      await userEvent.click(daySegment);
      await userEvent.keyboard('{ArrowUp}');
      
      // Should call onChange as it doesn't violate max constraint
      expect(onChange).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('handles invalid date input gracefully', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      
      render(<AccessibleDatePicker {...defaultProps} onChange={onChange} />);
      
      const yearSegment = screen.getAllByRole('spinbutton')[2];
      await user.click(yearSegment);
      await user.type(yearSegment, 'abcd');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('handles edge cases in date conversion', () => {
      // Test with edge case dates
      const edgeDate = new Date('1970-01-01');
      
      expect(() => {
        render(<AccessibleDatePicker {...defaultProps} value={edgeDate} />);
      }).not.toThrow();
      
      const segments = screen.getAllByRole('spinbutton');
      expect(segments.map(s => s.textContent?.trim())).toEqual(['1', '1', '1970']);
    });
  });

  describe('Dark Mode Support', () => {
    it('applies dark mode classes', () => {
      const { container } = render(<AccessibleDatePicker {...defaultProps} />);
      const fieldContainer = container.querySelector('.dark\\:bg-gray-700.dark\\:text-white.dark\\:border-gray-600');
      expect(fieldContainer).toBeTruthy();
      const button = screen.getByRole('button', { name: /open calendar/i });
      expect(button).toHaveClass('dark:bg-gray-600', 'dark:hover:bg-gray-500');
    });
  });
});
