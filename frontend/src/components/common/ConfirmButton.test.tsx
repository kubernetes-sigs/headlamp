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

import Button, { ButtonProps } from '@mui/material/Button';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import ConfirmButton, { ConfirmButtonProps } from './ConfirmButton';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|')[1] || key,
  }),
}));

const renderComponent = (props: Partial<ConfirmButtonProps> = {}) => {
  const defaultProps = {
    confirmTitle: 'Confirm Action',
    confirmDescription: 'Are you sure you want to proceed?',
    onConfirm: vi.fn(),
  };

  return render(
    <TestContext>
      <ConfirmButton {...defaultProps} {...props}>
        Delete
      </ConfirmButton>
    </TestContext>
  );
};

describe('ConfirmButton', () => {
  it('renders the button with correct label', () => {
    renderComponent();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('does not show confirm dialog before button is clicked', () => {
    renderComponent();
    expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
  });

  it('opens confirm dialog when button is clicked', () => {
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    renderComponent({ onConfirm });
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm-button' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
    });
  });

  it('does not call onConfirm when cancel button is clicked', () => {
    const onConfirm = vi.fn();
    renderComponent({ onConfirm });
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: 'cancel-button' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes dialog after cancel is clicked', async () => {
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'cancel-button' }));
    await waitFor(() => {
      expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
    });
  });

  it('renders with ariaLabel on the button', () => {
    renderComponent({ ariaLabel: 'delete-item' });
    expect(screen.getByRole('button', { name: /delete-item/i })).toBeInTheDocument();
  });

  it('renders and opens confirm dialog when buttonComponent is provided', () => {
    const CustomButton = (props: ButtonProps) => <Button data-testid="custom-trigger" {...props} />;

    renderComponent({ buttonComponent: CustomButton });
    expect(screen.getByTestId('custom-trigger')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('custom-trigger'));
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
  });
});
