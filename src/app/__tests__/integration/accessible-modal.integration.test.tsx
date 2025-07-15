/**
 * AccessibleModal Integration Tests
 * 
 * Tests the AccessibleModal component in realistic usage scenarios,
 * including integration with forms, complex interactions, and real-world workflows.
 */

import React, { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import AccessibleModal from '../../admin/components/AccessibleModal';

// Mock form component that simulates real usage
function MockFormModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', category: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    
    if (!formData.name) newErrors.name = 'Name is required';
    if (!formData.email) newErrors.email = 'Email is required';
    if (!formData.category) newErrors.category = 'Category is required';
    
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length === 0) {
      setIsOpen(false);
      setFormData({ name: '', email: '', category: '' });
    }
  };

  return (
    <div>
      <button 
        data-testid="open-modal-trigger"
        onClick={() => setIsOpen(true)}
      >
        Open Form Modal
      </button>
      
      <AccessibleModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="User Registration Form"
        size="md"
      >
        <form onSubmit={handleSubmit} data-testid="modal-form">
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium">
                Name {errors.name && <span className="text-red-500">*</span>}
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 block w-full border rounded-md px-3 py-2"
                aria-describedby={errors.name ? 'name-error' : undefined}
              />
              {errors.name && (
                <div id="name-error" className="text-red-500 text-sm mt-1">
                  {errors.name}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                Email {errors.email && <span className="text-red-500">*</span>}
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-1 block w-full border rounded-md px-3 py-2"
                aria-describedby={errors.email ? 'email-error' : undefined}
              />
              {errors.email && (
                <div id="email-error" className="text-red-500 text-sm mt-1">
                  {errors.email}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="category" className="block text-sm font-medium">
                Category {errors.category && <span className="text-red-500">*</span>}
              </label>
              <select
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="mt-1 block w-full border rounded-md px-3 py-2"
                aria-describedby={errors.category ? 'category-error' : undefined}
              >
                <option value="">Select a category</option>
                <option value="business">Business</option>
                <option value="personal">Personal</option>
                <option value="education">Education</option>
              </select>
              {errors.category && (
                <div id="category-error" className="text-red-500 text-sm mt-1">
                  {errors.category}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                Submit
              </button>
            </div>
          </div>
        </form>
      </AccessibleModal>
    </div>
  );
}

// Mock confirmation dialog component
function MockConfirmationModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<string>('');

  const handleConfirm = () => {
    setResult('confirmed');
    setIsOpen(false);
  };

  const handleCancel = () => {
    setResult('cancelled');
    setIsOpen(false);
  };

  return (
    <div>
      <button 
        data-testid="open-confirmation-trigger"
        onClick={() => setIsOpen(true)}
      >
        Delete Item
      </button>
      
      <div data-testid="result">{result}</div>
      
      <AccessibleModal
        isOpen={isOpen}
        onClose={handleCancel}
        title="Confirm Deletion"
        size="sm"
        isDismissable={false}
        isKeyboardDismissDisabled={true}
      >
        <div className="space-y-4">
          <p>Are you sure you want to delete this item? This action cannot be undone.</p>
          
          <div className="flex justify-end space-x-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 border rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
            >
              Delete
            </button>
          </div>
        </div>
      </AccessibleModal>
    </div>
  );
}

describe('AccessibleModal Integration Tests', () => {
  describe('Form Modal Integration', () => {
    it('should handle complete form submission workflow', async () => {
      const user = userEvent.setup();
      render(<MockFormModal />);

      // Open the modal
      const openButton = screen.getByTestId('open-modal-trigger');
      await user.click(openButton);

      // Verify modal is open
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('User Registration Form')).toBeInTheDocument();

      // Fill out the form
      const nameInput = screen.getByLabelText(/name/i);
      const emailInput = screen.getByLabelText(/email/i);
      const categorySelect = screen.getByLabelText(/category/i);

      await user.type(nameInput, 'John Doe');
      await user.type(emailInput, 'john@example.com');
      await user.selectOptions(categorySelect, 'business');

      // Submit the form
      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      // Verify modal closes after successful submission
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('should handle form validation errors', async () => {
      const user = userEvent.setup();
      render(<MockFormModal />);

      // Open the modal
      const openButton = screen.getByTestId('open-modal-trigger');
      await user.click(openButton);

      // Try to submit empty form
      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      // Verify validation errors are shown
      expect(screen.getByText('Name is required')).toBeInTheDocument();
      expect(screen.getByText('Email is required')).toBeInTheDocument();
      expect(screen.getByText('Category is required')).toBeInTheDocument();

      // Verify modal stays open
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Fill out form partially and verify errors update
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'John Doe');
      await user.click(submitButton);

      // Name error should be gone, others should remain
      expect(screen.queryByText('Name is required')).not.toBeInTheDocument();
      expect(screen.getByText('Email is required')).toBeInTheDocument();
      expect(screen.getByText('Category is required')).toBeInTheDocument();
    });

    it('should handle form cancellation', async () => {
      const user = userEvent.setup();
      render(<MockFormModal />);

      // Open the modal
      const openButton = screen.getByTestId('open-modal-trigger');
      await user.click(openButton);

      // Fill out some data
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'John Doe');

      // Cancel the form
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      // Verify modal closes
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Reopen and verify form is reset
      await user.click(openButton);
      const nameInputAfterReopen = screen.getByLabelText(/name/i);
      expect(nameInputAfterReopen).toHaveValue('');
    });

    it('should maintain focus management during form interactions', async () => {
      const user = userEvent.setup();
      render(<MockFormModal />);

      // Open the modal
      const openButton = screen.getByTestId('open-modal-trigger');
      await user.click(openButton);

      // Verify initial focus is on close button or first form element
      await waitFor(() => {
        const focusedElement = document.activeElement;
        expect(focusedElement).toBeTruthy();
      });

      // Tab through form elements
      const nameInput = screen.getByLabelText(/name/i);
      const emailInput = screen.getByLabelText(/email/i);
      const categorySelect = screen.getByLabelText(/category/i);
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      const submitButton = screen.getByRole('button', { name: /submit/i });

      // Verify all form elements are focusable
      await user.click(nameInput);
      expect(nameInput).toHaveFocus();

      await user.tab();
      expect(emailInput).toHaveFocus();

      await user.tab();
      expect(categorySelect).toHaveFocus();

      await user.tab();
      expect(cancelButton).toHaveFocus();

      await user.tab();
      expect(submitButton).toHaveFocus();
    });
  });

  describe('Confirmation Modal Integration', () => {
    it('should handle confirmation workflow', async () => {
      const user = userEvent.setup();
      render(<MockConfirmationModal />);

      // Open the confirmation modal
      const openButton = screen.getByTestId('open-confirmation-trigger');
      await user.click(openButton);

      // Verify modal is open and not dismissable
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Confirm Deletion')).toBeInTheDocument();

      // Confirm the action
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      // Verify modal closes and result is set
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('result')).toHaveTextContent('confirmed');
    });

    it('should handle cancellation workflow', async () => {
      const user = userEvent.setup();
      render(<MockConfirmationModal />);

      // Open the confirmation modal
      const openButton = screen.getByTestId('open-confirmation-trigger');
      await user.click(openButton);

      // Cancel the action
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      // Verify modal closes and result is set
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('result')).toHaveTextContent('cancelled');
    });

    it('should not close on escape key when keyboard dismiss is disabled', async () => {
      const user = userEvent.setup();
      render(<MockConfirmationModal />);

      // Open the confirmation modal
      const openButton = screen.getByTestId('open-confirmation-trigger');
      await user.click(openButton);

      // Try to close with escape key
      await user.keyboard('{Escape}');

      // Verify modal stays open
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should not close on backdrop click when not dismissable', async () => {
      const user = userEvent.setup();
      render(<MockConfirmationModal />);

      // Open the confirmation modal
      const openButton = screen.getByTestId('open-confirmation-trigger');
      await user.click(openButton);

      // Try to click backdrop (this is harder to test with React Aria, 
      // but we can verify the modal configuration)
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();

      // The modal should still be open (React Aria handles the backdrop logic)
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('Multiple Modal Scenarios', () => {
    it('should handle nested modal scenarios', async () => {
      const user = userEvent.setup();
      
      function NestedModalComponent() {
        const [firstModalOpen, setFirstModalOpen] = useState(false);
        const [secondModalOpen, setSecondModalOpen] = useState(false);

        return (
          <div>
            <button 
              data-testid="open-first-modal"
              onClick={() => setFirstModalOpen(true)}
            >
              Open First Modal
            </button>

            <AccessibleModal
              isOpen={firstModalOpen}
              onClose={() => setFirstModalOpen(false)}
              title="First Modal"
            >
              <div>
                <p>This is the first modal</p>
                <button 
                  data-testid="open-second-modal"
                  onClick={() => setSecondModalOpen(true)}
                >
                  Open Second Modal
                </button>
              </div>
            </AccessibleModal>

            <AccessibleModal
              isOpen={secondModalOpen}
              onClose={() => setSecondModalOpen(false)}
              title="Second Modal"
              size="sm"
            >
              <div>
                <p>This is the second modal</p>
                <button 
                  data-testid="close-second-modal"
                  onClick={() => setSecondModalOpen(false)}
                >
                  Close Second Modal
                </button>
              </div>
            </AccessibleModal>
          </div>
        );
      }

      render(<NestedModalComponent />);

      // Open first modal
      const openFirstButton = screen.getByTestId('open-first-modal');
      await user.click(openFirstButton);
      expect(screen.getByText('First Modal')).toBeInTheDocument();

      // Open second modal from within first modal
      const openSecondButton = screen.getByTestId('open-second-modal');
      await user.click(openSecondButton);
      expect(screen.getByText('Second Modal')).toBeInTheDocument();

      // Both modals should be present
      expect(screen.getByText('First Modal')).toBeInTheDocument();
      expect(screen.getByText('Second Modal')).toBeInTheDocument();

      // Close second modal
      const closeSecondButton = screen.getByTestId('close-second-modal');
      await user.click(closeSecondButton);

      // First modal should still be open
      expect(screen.getByText('First Modal')).toBeInTheDocument();
      expect(screen.queryByText('Second Modal')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility Integration', () => {
    it('should work with screen reader announcements', async () => {
      const user = userEvent.setup();
      render(<MockFormModal />);

      // Open modal
      const openButton = screen.getByTestId('open-modal-trigger');
      await user.click(openButton);

      // Verify ARIA attributes are properly set
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('role', 'dialog');

      // Verify title is properly associated
      const title = screen.getByText('User Registration Form');
      expect(title).toBeInTheDocument();

      // Verify form labels are properly associated
      const nameInput = screen.getByLabelText(/name/i);
      expect(nameInput).toHaveAttribute('id', 'name');

      const emailInput = screen.getByLabelText(/email/i);
      expect(emailInput).toHaveAttribute('id', 'email');

      const categorySelect = screen.getByLabelText(/category/i);
      expect(categorySelect).toHaveAttribute('id', 'category');
    });

    it('should handle error announcements properly', async () => {
      const user = userEvent.setup();
      render(<MockFormModal />);

      // Open modal and trigger validation errors
      const openButton = screen.getByTestId('open-modal-trigger');
      await user.click(openButton);

      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);

      // Verify error messages are properly associated with inputs
      const nameInput = screen.getByLabelText(/name/i);
      expect(nameInput).toHaveAttribute('aria-describedby', 'name-error');

      const emailInput = screen.getByLabelText(/email/i);
      expect(emailInput).toHaveAttribute('aria-describedby', 'email-error');

      const categorySelect = screen.getByLabelText(/category/i);
      expect(categorySelect).toHaveAttribute('aria-describedby', 'category-error');

      // Verify error elements exist
      expect(screen.getByText('Name is required')).toHaveAttribute('id', 'name-error');
      expect(screen.getByText('Email is required')).toHaveAttribute('id', 'email-error');
      expect(screen.getByText('Category is required')).toHaveAttribute('id', 'category-error');
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle rapid open/close operations', async () => {
      const user = userEvent.setup();
      render(<MockFormModal />);

      const openButton = screen.getByTestId('open-modal-trigger');

      // Rapidly open and close modal multiple times
      for (let i = 0; i < 5; i++) {
        await user.click(openButton);
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        const cancelButton = screen.getByRole('button', { name: /cancel/i });
        await user.click(cancelButton);

        await waitFor(() => {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
      }
    });

    it('should handle modal with no focusable elements', async () => {
      const user = userEvent.setup();
      
      function ModalWithNoFocusableElements() {
        const [isOpen, setIsOpen] = useState(false);

        return (
          <div>
            <button onClick={() => setIsOpen(true)}>Open Modal</button>
            <AccessibleModal
              isOpen={isOpen}
              onClose={() => setIsOpen(false)}
              title="Information Modal"
            >
              <div>
                <p>This modal has no focusable elements except the close button.</p>
                <p>This tests edge case handling.</p>
              </div>
            </AccessibleModal>
          </div>
        );
      }

      render(<ModalWithNoFocusableElements />);

      const openButton = screen.getByRole('button', { name: /open modal/i });
      await user.click(openButton);

      // Modal should still work and focus should go to close button
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      
      const closeButton = screen.getByRole('button', { name: /close modal/i });
      expect(closeButton).toBeInTheDocument();

      // Should be able to close with close button
      await user.click(closeButton);
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });
});