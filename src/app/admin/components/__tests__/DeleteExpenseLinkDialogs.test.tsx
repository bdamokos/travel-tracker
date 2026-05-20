/**
 * @jest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import DeleteWarningDialog from '@/app/admin/components/DeleteWarningDialog';
import ReassignmentDialog from '@/app/admin/components/ReassignmentDialog';
import type { LinkedExpense } from '@/app/lib/costLinkCleanup';

const linkedExpenses: LinkedExpense[] = [
  {
    id: 'expense-1',
    description: 'Hotel deposit',
    amount: 125,
    currency: 'EUR',
    date: '2026-02-03',
    costTrackerId: 'cost-trip-1',
    costTrackerTitle: 'Winter trip',
  },
];

describe('expense-link deletion dialogs', () => {
  it('renders the delete warning dialog without requiring an ancestor modal provider', async () => {
    expect(() => {
      render(<DeleteWarningDialogFixture />);
    }).not.toThrow();

    const dialog = screen.getByRole('dialog', { name: /delete location/i });
    expect(dialog).toHaveAttribute('data-ismodal', 'true');
    expect(screen.getByText(/Linked Expenses Found/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('background-content').parentElement).toHaveAttribute('aria-hidden', 'true'));
  });

  it('renders the reassignment dialog without requiring an ancestor modal provider', async () => {
    expect(() => {
      render(<ReassignmentDialogFixture />);
    }).not.toThrow();

    const dialog = screen.getByRole('dialog', { name: /reassign linked expenses/i });
    expect(dialog).toHaveAttribute('data-ismodal', 'true');
    expect(screen.getByLabelText(/Lyon to Marseille/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('background-content').parentElement).toHaveAttribute('aria-hidden', 'true'));
  });
});

function DeleteWarningDialogFixture() {
  return (
    <>
      <main data-testid="background-content">Background content</main>
      <DeleteWarningDialog
        isOpen
        itemType="location"
        itemName="Paris"
        linkedExpenses={linkedExpenses}
        onChoice={jest.fn()}
      />
    </>
  );
}

function ReassignmentDialogFixture() {
  return (
    <>
      <main data-testid="background-content">Background content</main>
      <ReassignmentDialog
        isOpen
        itemType="route"
        fromItemName="Paris to Lyon"
        linkedExpenses={linkedExpenses}
        availableItems={[{ id: 'route-2', name: 'Lyon to Marseille' }]}
        onReassign={jest.fn()}
        onCancel={jest.fn()}
      />
    </>
  );
}
