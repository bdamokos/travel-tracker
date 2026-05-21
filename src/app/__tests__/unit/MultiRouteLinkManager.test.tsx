import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import MultiRouteLinkManager from '@/app/admin/components/MultiRouteLinkManager';

describe('MultiRouteLinkManager', () => {
  it('notifies parent when the last existing link is removed', async () => {
    const onLinksChange = jest.fn();

    render(
      <MultiRouteLinkManager
        expenseId="expense-1"
        tripId="trip-1"
        expenseAmount={100}
        initialLinks={[
          {
            id: 'route-1',
            type: 'route',
            name: 'A to B'
          }
        ]}
        onLinksChange={onLinksChange}
      />
    );

    await screen.findByText('A to B');
    onLinksChange.mockClear();

    fireEvent.click(screen.getByTitle('Remove link'));

    await waitFor(() => {
      expect(onLinksChange).toHaveBeenCalledWith([]);
    });
  });
});
