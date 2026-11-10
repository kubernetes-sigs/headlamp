/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import EmptyContent from './EmptyContent';

vi.mock('@mui/material/Typography', () => {
  return {
    default: ({ children, color, ...props }: any) => (
      <p data-color={color} {...props}>
        {children}
      </p>
    ),
  };
});

describe('EmptyContent', () => {
  it('renders a string child wrapped in a Typography component', () => {
    render(<EmptyContent>No data available</EmptyContent>);
    const textElement = screen.getByText('No data available');
    expect(textElement).toBeInTheDocument();
    expect(textElement.tagName).toBe('P'); // Typography renders as a <p> by default
  });

  it('renders a ReactNode child without wrapping it in Typography', () => {
    const { container } = render(
      <EmptyContent>
        <div data-testid="custom-child">Custom Content</div>
      </EmptyContent>
    );
    const customChild = screen.getByTestId('custom-child');
    expect(customChild).toBeInTheDocument();
    expect(customChild.parentElement).toBe(container.firstElementChild);
  });
  it('applies the default textSecondary color to string children', () => {
    render(<EmptyContent>Empty State</EmptyContent>);
    const textElement = screen.getByText('Empty State');
    expect(textElement).toHaveAttribute('data-color', 'textSecondary');
  });

  it('applies the provided color to string children', () => {
    render(<EmptyContent color="error">Error State</EmptyContent>);
    const textElement = screen.getByText('Error State');
    expect(textElement).toHaveAttribute('data-color', 'error');
  });
});
