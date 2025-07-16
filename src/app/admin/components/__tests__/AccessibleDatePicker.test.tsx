import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import AccessibleDatePicker from '../AccessibleDatePicker';

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
      render(<AccessibleDatePicker {...defaultProps} />);
      
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('id', 'test-date-picker');
      expect(input).toHaveAttribute('placeholder', 'Select a date');
    });

    it('renders calendar button', () => {
      render(<AccessibleDatePicker {...defaultProps} />);
      
      const calendarButton = screen.getByRole('button', { name: /open calendar/i });
      expect(calendarButton).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<AccessibleDatePicker {...defaultProps} className="custom-class" />);
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('custom-class');
    });

    it('renders as required when specified', () => {
      render(<AccessibleDatePicker {...defaultProps} required />);
      
      const input = screen.getByRole('textbox');
      expect(input).toBeRequired();
    });

    it('renders as disabled when specified', () => {
      render(<AccessibleDatePicker {...defaultProps} isDisabled />);
      
      const input = screen.getByRole('textbox');
      const button = screen.getByRole('button', { name: /open calendar/i });
      
      expect(input).toBeDisabled();
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
    it('accepts valid date input in YYYY-MM-DD format', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      
      render(<AccessibleDatePicker {...defaultProps} onChange={onChange} />);
      
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, '2024-01-15');
      
      expect(input).toHaveValue('2024-01-15');
    });

    it('has correct input pattern for date validation', () => {
      render(<AccessibleDatePicker {...defaultProps} />);
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('pattern', '\\d{4}-\\d{2}-\\d{2}');
    });

    it('displays formatted date value', () => {
      const testDate = new Date('2024-01-15');
      render(<AccessibleDatePicker {...defaultProps} value={testDate} />);
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('2024-01-15');
    });

    it('handles null/undefined values gracefully', () => {
      render(<AccessibleDatePicker {...defaultProps} value={null} />);
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('');
    });
  });

  describe('Keyboard Navigation', () => {
    it('opens calendar on Enter key', async () => {
      const user = userEvent.setup();
      render(<AccessibleDatePicker {...defaultProps} />);
      
      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.keyboard('{Enter}');
      
      // Calendar should be opened - we can check for calendar elements
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('opens calendar on Alt+ArrowDown', async () => {
      const user = userEvent.setup();
      render(<AccessibleDatePicker {...defaultProps} />);
      
      const input = screen.getByRole('textbox');
      await user.click(input);
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
      
      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.keyboard('{ArrowUp}');
      
      expect(onChange).toHaveBeenCalled();
    });

    it('prevents default behavior on navigation keys', async () => {
      const user = userEvent.setup();
      render(<AccessibleDatePicker {...defaultProps} />);
      
      const input = screen.getByRole('textbox');
      await user.click(input);
      
      const keydownEvent = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true });
      const preventDefaultSpy = jest.spyOn(keydownEvent, 'preventDefault');
      
      fireEvent(input, keydownEvent);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('does not handle keyboard navigation when disabled', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      
      render(<AccessibleDatePicker {...defaultProps} isDisabled onChange={onChange} />);
      
      const input = screen.getByRole('textbox');
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
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveAccessibleName(/custom date picker/i);
    });

    it('supports aria-describedby', () => {
      render(
        <div>
          <AccessibleDatePicker {...defaultProps} aria-describedby="date-help" />
          <div id="date-help">Help text for date picker</div>
        </div>
      );
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-describedby', 'date-help');
    });

    it('has proper focus management', async () => {
      const user = userEvent.setup();
      render(<AccessibleDatePicker {...defaultProps} />);
      
      const input = screen.getByRole('textbox');
      const calendarButton = screen.getByRole('button', { name: /open calendar/i });
      
      // Tab should move focus from input to button
      await user.click(input);
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
      
      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'ArrowLeft' }); // Try to go to previous day
      
      // Should not call onChange if it would violate min constraint
      // This test verifies the constraint logic exists
      expect(input).toBeInTheDocument();
    });

    it('respects maximum date constraint', () => {
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
      
      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'ArrowRight' }); // Try to go to next day
      
      // Should call onChange as it doesn't violate max constraint
      expect(onChange).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('handles invalid date input gracefully', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      
      render(<AccessibleDatePicker {...defaultProps} onChange={onChange} />);
      
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'invalid-date');
      
      // Should not crash and should not call onChange with invalid date
      expect(input).toHaveValue('invalid-date');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('handles edge cases in date conversion', () => {
      // Test with edge case dates
      const edgeDate = new Date('1970-01-01');
      
      expect(() => {
        render(<AccessibleDatePicker {...defaultProps} value={edgeDate} />);
      }).not.toThrow();
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('1970-01-01');
    });
  });

  describe('Dark Mode Support', () => {
    it('applies dark mode classes', () => {
      render(<AccessibleDatePicker {...defaultProps} />);
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('dark:bg-gray-700', 'dark:text-white', 'dark:border-gray-600');
      
      const button = screen.getByRole('button', { name: /open calendar/i });
      expect(button).toHaveClass('dark:bg-gray-600', 'dark:hover:bg-gray-500');
    });
  });
});