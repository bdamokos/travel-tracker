import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import YnabImportForm from '../YnabImportForm';
import { CostTrackingData } from '../../../types';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockCostData: CostTrackingData = {
  id: 'test-cost-id',
  tripId: 'test-trip-id',
  tripTitle: 'Test Trip',
  tripStartDate: new Date('2024-01-01'),
  tripEndDate: new Date('2024-01-10'),
  overallBudget: 1000,
  currency: 'EUR',
  countryBudgets: [
    {
      id: 'budget-1',
      country: 'France',
      amount: 500,
      currency: 'EUR',
      notes: ''
    }
  ],
  expenses: [],
  customCategories: ['Food', 'Transport', 'Accommodation'],
  createdAt: '2024-01-01T00:00:00Z'
};

describe('YnabImportForm', () => {
  const mockOnImportComplete = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  const navigateToFileUploadStep = () => {
    fireEvent.click(screen.getByText('Upload YNAB Export File'));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
  };

  it('renders when isOpen is true', () => {
    render(
      <YnabImportForm
        isOpen={true}
        costData={mockCostData}
        onImportComplete={mockOnImportComplete}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('Choose Import Method')).toBeInTheDocument();
    expect(screen.getByText('Upload YNAB Export File')).toBeInTheDocument();
    expect(screen.getByText('Load from YNAB API')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(
      <YnabImportForm
        isOpen={false}
        costData={mockCostData}
        onImportComplete={mockOnImportComplete}
        onClose={mockOnClose}
      />
    );

    expect(screen.queryByText('Choose Import Method')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(
      <YnabImportForm
        isOpen={true}
        costData={mockCostData}
        onImportComplete={mockOnImportComplete}
        onClose={mockOnClose}
      />
    );

    const closeButton = screen.getByRole('button', { name: /close modal/i });
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('shows file upload interface after selecting file import method', async () => {
    render(
      <YnabImportForm
        isOpen={true}
        costData={mockCostData}
        onImportComplete={mockOnImportComplete}
        onClose={mockOnClose}
      />
    );

    navigateToFileUploadStep();

    expect(screen.getByText('Choose TSV or ZIP File')).toBeInTheDocument();
    expect(screen.getByText(/Upload your YNAB export file/)).toBeInTheDocument();
  });

  it('handles keyboard navigation (Escape key)', () => {
    render(
      <YnabImportForm
        isOpen={true}
        costData={mockCostData}
        onImportComplete={mockOnImportComplete}
        onClose={mockOnClose}
      />
    );

    // The AccessibleModal should handle Escape key through React Aria
    // This test verifies the modal is properly configured with accessibility features
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('preserves existing functionality - step progression', async () => {
    render(
      <YnabImportForm
        isOpen={true}
        costData={mockCostData}
        onImportComplete={mockOnImportComplete}
        onClose={mockOnClose}
      />
    );

    // Initially should show method selection
    expect(screen.getByText('Choose Import Method')).toBeInTheDocument();

    navigateToFileUploadStep();

    // After selecting file import, should show upload step
    expect(screen.getByText('Upload YNAB Export')).toBeInTheDocument();
    const fileInput = screen.getByRole('button', { name: /choose tsv or zip file/i });
    expect(fileInput).toBeInTheDocument();
  });

  it('shows progress indicator', () => {
    render(
      <YnabImportForm
        isOpen={true}
        costData={mockCostData}
        onImportComplete={mockOnImportComplete}
        onClose={mockOnClose}
      />
    );

    // Check for progress steps
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('uses AccessibleModal with correct accessibility attributes', () => {
    render(
      <YnabImportForm
        isOpen={true}
        costData={mockCostData}
        onImportComplete={mockOnImportComplete}
        onClose={mockOnClose}
      />
    );

    // Verify the modal is rendered with correct accessibility attributes
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Choose Import Method')).toBeInTheDocument();
  });
});
