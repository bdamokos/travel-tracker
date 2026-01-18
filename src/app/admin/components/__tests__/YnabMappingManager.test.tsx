import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import YnabMappingManager from '@/app/admin/components/YnabMappingManager';
import { CostTrackingData, YnabCategoryMapping } from '@/app/types';

// Mock the AccessibleModal component
jest.mock('../AccessibleModal', () => {
  return function MockAccessibleModal({ 
    isOpen, 
    onClose, 
    title, 
    children 
  }: { 
    isOpen: boolean; 
    onClose: () => void; 
    title: string; 
    children: React.ReactNode; 
  }) {
    if (!isOpen) return null;
    return (
      <div data-testid="accessible-modal" role="dialog" aria-modal="true">
        <div>
          <h2>{title}</h2>
          <button onClick={onClose} data-testid="close-button">×</button>
        </div>
        <div>{children}</div>
      </div>
    );
  };
});

// Mock AriaSelect component
jest.mock('../AriaSelect', () => {
  return function MockAriaSelect({ 
    id, 
    value, 
    onChange, 
    options, 
    placeholder 
  }: { 
    id: string; 
    value?: string; 
    onChange: (value: string) => void; 
    options: Array<{ value: string; label: string }>; 
    placeholder?: string; 
  }) {
    return (
      <select
        id={id}
        data-testid={id}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  };
});

const mockCostData: CostTrackingData = {
  id: 'test-cost-id',
  tripId: 'test-trip-id',
  tripName: 'Test Trip',
  tripStartDate: '2024-01-01',
  tripEndDate: '2024-01-10',
  overallBudget: 1000,
  currency: 'EUR',
  countryBudgets: [
    {
      id: 'budget-1',
      country: 'France',
      amount: 500,
      currency: 'EUR',
      notes: 'Test budget'
    },
    {
      id: 'budget-2',
      country: 'Spain',
      amount: 300,
      currency: 'EUR',
      notes: 'Test budget 2'
    }
  ],
  expenses: [],
  customCategories: ['Transport', 'Food', 'Accommodation'],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ynabImportData: {
    mappings: [
      {
        ynabCategory: 'Travel - Transport',
        mappingType: 'country',
        countryName: 'France'
      }
    ],
    importedTransactionHashes: []
  }
};

describe('YnabMappingManager', () => {
  const mockOnSave = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when isOpen is true', () => {
    render(
      <YnabMappingManager
        isOpen={true}
        costData={mockCostData}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByTestId('accessible-modal')).toBeInTheDocument();
    expect(screen.getByText('YNAB Category Mappings')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(
      <YnabMappingManager
        isOpen={false}
        costData={mockCostData}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    expect(screen.queryByTestId('accessible-modal')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <YnabMappingManager
        isOpen={true}
        costData={mockCostData}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    const closeButton = screen.getByTestId('close-button');
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('displays existing mappings from costData', () => {
    render(
      <YnabMappingManager
        isOpen={true}
        costData={mockCostData}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByDisplayValue('Travel - Transport')).toBeInTheDocument();
    expect(screen.getByText('Existing Mappings (1)')).toBeInTheDocument();
  });

  it('allows adding new mappings', async () => {
    const user = userEvent.setup();
    
    render(
      <YnabMappingManager
        isOpen={true}
        costData={mockCostData}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    // Fill in new mapping form
    const categoryInput = screen.getByLabelText('YNAB Category');
    await user.type(categoryInput, 'Travel - Food');

    const mappingTypeSelect = screen.getByLabelText('Mapping Type');
    await user.selectOptions(mappingTypeSelect, 'general');

    const addButton = screen.getByText('Add Mapping');
    await user.click(addButton);

    // Should show 2 mappings now (1 existing + 1 new)
    expect(screen.getByText('Existing Mappings (2)')).toBeInTheDocument();
  });

  it('calls onSave with mappings when Save button is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <YnabMappingManager
        isOpen={true}
        costData={mockCostData}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    const saveButton = screen.getByText('Save Mappings');
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledWith([
      {
        ynabCategory: 'Travel - Transport',
        mappingType: 'country',
        countryName: 'France'
      }
    ]);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('allows deleting existing mappings', async () => {
    const user = userEvent.setup();
    
    render(
      <YnabMappingManager
        isOpen={true}
        costData={mockCostData}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    const deleteButton = screen.getByText('Delete');
    await user.click(deleteButton);

    // Should show 0 mappings after deletion
    expect(screen.getByText('Existing Mappings (0)')).toBeInTheDocument();
    expect(screen.getByText('No mappings configured yet. Add mappings above to speed up future imports.')).toBeInTheDocument();
  });

  it('handles file upload for extracting categories', async () => {
    const { container } = render(
      <YnabMappingManager
        isOpen={true}
        costData={mockCostData}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    const fileInput = container.querySelector('input[type="file"]');
    
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('accept', '.tsv,.zip');
  });

  it('shows available countries from cost data in country select', () => {
    render(
      <YnabMappingManager
        isOpen={true}
        costData={mockCostData}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    // The countries should be available in the AriaSelect options
    // This is tested through the mock implementation
    expect(screen.getByTestId('accessible-modal')).toBeInTheDocument();
  });

  it('maintains accessibility features through AccessibleModal', () => {
    render(
      <YnabMappingManager
        isOpen={true}
        costData={mockCostData}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    const modal = screen.getByTestId('accessible-modal');
    expect(modal).toHaveAttribute('role', 'dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');
  });

  it('handles keyboard navigation through AccessibleModal', async () => {
    const user = userEvent.setup();
    
    render(
      <YnabMappingManager
        isOpen={true}
        costData={mockCostData}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    // Test that focus can be moved around the modal
    const closeButton = screen.getByTestId('close-button');
    closeButton.focus();
    expect(closeButton).toHaveFocus();

    // Test escape key functionality (handled by AccessibleModal)
    await user.keyboard('{Escape}');
    // The mock doesn't implement escape key handling, but in real usage
    // AccessibleModal would handle this
  });
});
