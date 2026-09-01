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

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import ConfirmDialog, { ConfirmDialogProps } from './ConfirmDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|')[1] || key,
  }),
}));

const renderDialog = (props: Partial<ConfirmDialogProps> = {}) => {
  const defaultProps: ConfirmDialogProps = {
    open: true,
    title: 'A fine title',
    description: 'A really good description.',
    onConfirm: vi.fn(),
    handleClose: vi.fn(),
  };

  return render(
    <TestContext>
      <ConfirmDialog {...defaultProps} {...props} />
    </TestContext>
  );
};

describe('ConfirmDialog', () => {
  it('renders title and description', () => {
    renderDialog();
    expect(screen.getByText('A fine title')).toBeInTheDocument();
    expect(screen.getByText('A really good description.')).toBeInTheDocument();
  });

  it('renders default Yes/No labels', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
  });

  it('renders custom confirm/cancel labels', () => {
    renderDialog({ confirmLabel: 'Delete', cancelLabel: 'Keep' });
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
  });

  it('does not render dialog content when closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByText('A fine title')).not.toBeInTheDocument();
  });

  it('calls handleClose then onConfirm when confirm is clicked', () => {
    const onConfirm = vi.fn();
    const handleClose = vi.fn();
    const callOrder: string[] = [];

    handleClose.mockImplementation(() => {
      callOrder.push('close');
    });
    onConfirm.mockImplementation(() => {
      callOrder.push('confirm');
    });

    renderDialog({ onConfirm, handleClose });

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['close', 'confirm']);
  });

  it('calls handleClose but not onConfirm when cancel is clicked', () => {
    const onConfirm = vi.fn();
    const handleClose = vi.fn();
    renderDialog({ onConfirm, handleClose });

    fireEvent.click(screen.getByRole('button', { name: 'No' }));

    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls handleClose but not onConfirm when Escape is pressed', () => {
    const onConfirm = vi.fn();
    const handleClose = vi.fn();
    renderDialog({ onConfirm, handleClose });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('hides the cancel button when hideCancelButton is true', () => {
    renderDialog({ hideCancelButton: true });
    expect(screen.queryByRole('button', { name: 'No' })).not.toBeInTheDocument();
  });

  it('disables the confirm button when confirmButtonDisabled is true', () => {
    const onConfirm = vi.fn();
    const handleClose = vi.fn();
    renderDialog({ confirmButtonDisabled: true, onConfirm, handleClose });

    const confirmButton = screen.getByRole('button', { name: 'Yes' });
    expect(confirmButton).toBeDisabled();

    fireEvent.click(confirmButton);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(handleClose).not.toHaveBeenCalled();
  });
});
