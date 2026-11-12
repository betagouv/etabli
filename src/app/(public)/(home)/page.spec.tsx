import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { HomePage } from '@etabli/src/app/(public)/(home)/HomePage';

describe.skip('HomePage', () => {
  it('renders', () => {
    render(<HomePage />);

    const heading = screen.getByRole('heading', {
      name: /établi/i,
      level: 1,
    });

    expect(heading).toBeInTheDocument();
  });
});
