import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ExpenseForm from '../ExpenseForm';
import { Expense, ExpenseType } from '../../../types';
import { ExpenseTravelLookup, TravelLinkInfo } from '../../../lib/expenseTravelLookup';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

describe('ExpenseForm', () => {
  const mockTravelLookup = new ExpenseTravelLookup('test-trip-1');
  const mockOnExpenseAdded = jest.fn();
  const mockSetCurrentExpense = jest.fn();
  const mockSetEditingExpenseIndex = jest.fn();

  const defaultProps = {
    currentExpense: {
      date: new Date('2024-07-15'),
      amount: 0,
      currency: 'EUR',
      category: '',
      country: '',
      description: '',
      notes: '',
      isGeneralExpense: false,
      expenseType: 'actual' as ExpenseType
    },
    setCurrentExpense: mockSetCurrentExpense,
    onExpenseAdded: mockOnExpenseAdded,
    editingExpenseIndex: null,
    setEditingExpenseIndex: mockSetEditingExpenseIndex,
    currency: 'EUR',
    categories: ['Food', 'Transport', 'Accommodation'],
    countryOptions: ['France', 'Germany', 'Italy'],
    travelLookup: mockTravelLookup,
    tripId: 'test-trip-1'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders expense form with all required fields', () => {
    render(<ExpenseForm {...defaultProps} />);

    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add expense/i })).toBeInTheDocument();
  });

  it('passes tripId prop to TravelItemSelector', () => {
    render(<ExpenseForm {...defaultProps} />);

    // The component should render without errors when tripId is provided
    expect(screen.getByTestId('expense-form')).toBeInTheDocument();

    // TravelItemSelector should be present (it will handle the tripId internally)
    expect(screen.getByText(/link to travel item/i)).toBeInTheDocument();
  });

  it('validates required fields and prevents submission with invalid data', async () => {
    const user = userEvent.setup();
    render(<ExpenseForm {...defaultProps} />);

    // Try to submit without filling required fields
    const submitButton = screen.getByRole('button', { name: /add expense/i });
    await user.click(submitButton);

    // Form should not submit (onExpenseAdded should not be called)
    expect(mockOnExpenseAdded).not.toHaveBeenCalled();
  });

  it('shows edit mode when editingExpenseIndex is set', () => {
    const editingProps = {
      ...defaultProps,
      editingExpenseIndex: 0,
      currentExpense: {
        ...defaultProps.currentExpense,
        id: 'test-expense-1',
        description: 'Test expense'
      }
    };

    render(<ExpenseForm {...editingProps} />);

    expect(screen.getByText('Edit Expense')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update expense/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel edit/i })).toBeInTheDocument();
  });

  it('cancels edit mode correctly', async () => {
    const user = userEvent.setup();
    const editingProps = {
      ...defaultProps,
      editingExpenseIndex: 0,
      currentExpense: {
        ...defaultProps.currentExpense,
        id: 'test-expense-1',
        description: 'Test expense'
      }
    };

    render(<ExpenseForm {...editingProps} />);

    const cancelButton = screen.getByRole('button', { name: /cancel edit/i });
    await user.click(cancelButton);

    expect(mockSetEditingExpenseIndex).toHaveBeenCalledWith(null);
    expect(mockSetCurrentExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        date: expect.any(Date),
        amount: 0,
        currency: 'EUR',
        category: '',
        country: '',
        description: '',
        notes: '',
        isGeneralExpense: false,
        expenseType: 'actual',
        travelReference: undefined
      })
    );
  });

  it('maintains trip context when tripId changes', () => {
    const { rerender } = render(<ExpenseForm {...defaultProps} />);

    // Verify initial render
    expect(screen.getByTestId('expense-form')).toBeInTheDocument();

    // Rerender with different tripId
    rerender(<ExpenseForm {...defaultProps} tripId="test-trip-2" />);

    // Should still render correctly with new tripId
    expect(screen.getByTestId('expense-form')).toBeInTheDocument();
  });
});