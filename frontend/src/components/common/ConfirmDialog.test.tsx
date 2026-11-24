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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import ConfirmDialog, { ConfirmDialogProps } from './ConfirmDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|')[1] || key,
  }),
}));

function renderComponent(props: Partial<ConfirmDialogProps> = {}) {
  const defaultProps: ConfirmDialogProps = {
    open: true,
    title: 'Delete Resource',
    description: 'Are you sure you want to proceed?',
    onConfirm: vi.fn(),
    handleClose: vi.fn(),
    ...props,
  };

  return {
    ...render(
      <TestContext>
        <ConfirmDialog {...defaultProps} />
      </TestContext>
    ),
    props: defaultProps,
  };
}

describe('ConfirmDialog', () => {
  describe('Rendering & Mounting Lifecycle', () => {
    it('renders title, description, and default "No" and "Yes" buttons when open', () => {
      renderComponent();
      expect(screen.getByText('Delete Resource')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
    });

    it('does not render dialog content into document when open is false', () => {
      renderComponent({ open: false });
      expect(screen.queryByText('Delete Resource')).not.toBeInTheDocument();
      expect(screen.queryByText('Are you sure you want to proceed?')).not.toBeInTheDocument();
    });

    it('renders rich ReactNode content in description without errors', () => {
      renderComponent({
        description: (
          <div data-testid="complex-desc">
            <span>
              Are you sure you want to delete <strong data-testid="target-name">nginx-pod</strong>?
            </span>
          </div>
        ),
      });
      expect(screen.getByTestId('complex-desc')).toBeInTheDocument();
      expect(screen.getByTestId('target-name')).toHaveTextContent('nginx-pod');
      expect(document.getElementById('alert-dialog-description')?.tagName).toBe('DIV');
    });

    it('renders gracefully when description is null and retains alert-dialog-description element', () => {
      renderComponent({ description: null });
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-describedby', 'alert-dialog-description');
      const descElem = document.getElementById('alert-dialog-description');
      expect(descElem).toBeInTheDocument();
      expect(descElem?.textContent).toBe('');
    });
  });

  describe('User Interactions & Callback Ordering', () => {
    it('calls handleClose strictly before calling onConfirm', () => {
      const executionOrder: string[] = [];
      renderComponent({
        handleClose: () => executionOrder.push('handleClose'),
        onConfirm: () => executionOrder.push('onConfirm'),
      });
      fireEvent.click(screen.getByTestId('confirm-button'));
      expect(executionOrder).toEqual(['handleClose', 'onConfirm']);
    });

    it('calls handleClose but does not call onConfirm when cancel button is clicked', () => {
      const { props } = renderComponent();
      fireEvent.click(screen.getByTestId('cancel-button'));
      expect(props.handleClose).toHaveBeenCalledTimes(1);
      expect(props.onConfirm).not.toHaveBeenCalled();
    });

    it('calls handleClose when clicking the backdrop overlay', () => {
      const { props } = renderComponent();
      const backdrop = document.querySelector('.MuiBackdrop-root');
      expect(backdrop).toBeInTheDocument();
      fireEvent.click(backdrop!);
      expect(props.handleClose).toHaveBeenCalled();
      expect(props.onConfirm).not.toHaveBeenCalled();
    });

    it('calls handleClose when Escape key is pressed', () => {
      const { props } = renderComponent();
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
      expect(props.handleClose).toHaveBeenCalled();
      expect(props.onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('Async Lifecycle', () => {
    it('fires handleClose synchronously without awaiting async onConfirm', () => {
      const handleClose = vi.fn();
      let resolveAction: () => void;
      const asyncConfirm = vi.fn(
        () =>
          new Promise<void>(resolve => {
            resolveAction = resolve;
          })
      );

      renderComponent({ handleClose, onConfirm: asyncConfirm });
      fireEvent.click(screen.getByTestId('confirm-button'));

      expect(handleClose).toHaveBeenCalledTimes(1);
      expect(asyncConfirm).toHaveBeenCalledTimes(1);
      resolveAction!();
    });
  });

  describe('Props & State Variations', () => {
    it('removes cancel button from document when hideCancelButton is true', () => {
      renderComponent({ hideCancelButton: true });
      expect(screen.queryByTestId('cancel-button')).not.toBeInTheDocument();
      expect(screen.getByTestId('confirm-button')).toBeInTheDocument();
    });

    it('disables confirm button when confirmButtonDisabled is true and prevents onConfirm', () => {
      const { props } = renderComponent({ confirmButtonDisabled: true });
      const confirmBtn = screen.getByTestId('confirm-button');
      expect(confirmBtn).toBeDisabled();
      fireEvent.click(confirmBtn);
      expect(props.onConfirm).not.toHaveBeenCalled();
      expect(props.handleClose).not.toHaveBeenCalled();
    });

    it('renders custom confirmLabel and cancelLabel when provided', () => {
      renderComponent({ confirmLabel: 'Permanently Delete', cancelLabel: 'Dismiss' });
      expect(screen.getByRole('button', { name: 'Permanently Delete' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    });

    it('merges custom PaperProps attributes and classes onto dialog paper', () => {
      renderComponent({
        PaperProps: {
          'data-testid': 'custom-paper',
          className: 'custom-paper-class',
        },
      });

      const paper = screen.getByTestId('custom-paper');
      expect(paper).toBeInTheDocument();
      expect(paper).toHaveClass('custom-paper-class');
    });
  });

  describe('WAI-ARIA & Accessibility Compliance', () => {
    it('has role="dialog" with matching aria-labelledby and aria-describedby', () => {
      renderComponent({ title: 'Danger Zone', description: 'Irreversible action' });
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'alert-dialog-title');
      expect(dialog).toHaveAttribute('aria-describedby', 'alert-dialog-description');

      expect(document.getElementById('alert-dialog-title')).toHaveTextContent('Danger Zone');
      expect(document.getElementById('alert-dialog-description')).toHaveTextContent(
        'Irreversible action'
      );
    });

    it('focuses the dialog content container on open', () => {
      renderComponent({ description: 'Testing focus target' });
      const content = screen.getByText('Testing focus target').closest('.MuiDialogContent-root');
      expect(content).toBeInTheDocument();
      expect(content).toHaveFocus();
    });

    it('restores focus to the triggering element when the dialog closes', async () => {
      function TestWrapper() {
        const [open, setOpen] = React.useState(false);
        return (
          <div>
            <button data-testid="trigger-btn" onClick={() => setOpen(true)}>
              Open Trigger
            </button>
            <ConfirmDialog
              open={open}
              title="Delete Item"
              description="Are you sure?"
              handleClose={() => setOpen(false)}
              onConfirm={() => setOpen(false)}
            />
          </div>
        );
      }

      render(
        <TestContext>
          <TestWrapper />
        </TestContext>
      );

      const trigger = screen.getByTestId('trigger-btn');
      trigger.focus();
      expect(trigger).toHaveFocus();

      fireEvent.click(trigger);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('cancel-button'));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
      });
    });
  });
});
