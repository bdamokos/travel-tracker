import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import AccommodationInput from '@/app/admin/components/AccommodationInput';

const renderInput = (website: string) => render(
  <AccommodationInput
    accommodationData={`---
name: Test Hotel
website: ${website}
---`}
    isAccommodationPublic={false}
    onAccommodationDataChange={jest.fn()}
    onPrivacyChange={jest.fn()}
  />
);

describe('AccommodationInput', () => {
  it('renders safe website schemes as preview links', async () => {
    const user = userEvent.setup();
    renderInput('https://hotel.example');

    await user.click(screen.getByRole('button', { name: /preview/i }));

    expect(screen.getByRole('link', { name: 'https://hotel.example' })).toHaveAttribute(
      'href',
      'https://hotel.example'
    );
  });

  it('does not render unsafe website schemes as preview links', async () => {
    const user = userEvent.setup();
    renderInput('javascript:alert(1)');

    await user.click(screen.getByRole('button', { name: /preview/i }));

    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).not.toBeInTheDocument();
  });
});
