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

import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../../test';
import CopyButton from './CopyButton';

describe('CopyButton', () => {
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    ['undefined', undefined],
    ['empty string', ''],
  ])('renders nothing when text is %s', (_, text) => {
    const { container } = render(
      <TestContext>
        <CopyButton text={text} />
      </TestContext>
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('copies text to clipboard, invokes onClick, announces Copied!, and resets after 1500ms', async () => {
    vi.useFakeTimers();
    const onClick = vi.fn();

    render(
      <TestContext>
        <CopyButton text="kubectl get pods" onClick={onClick} />
      </TestContext>
    );

    const button = screen.getByRole('button', { name: 'Copy to clipboard' });
    const statusRegion = screen.getByRole('status');
    expect(statusRegion).toHaveTextContent('');

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(writeTextMock).toHaveBeenCalledWith('kubectl get pods');
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    expect(statusRegion).toHaveTextContent('Copied!');

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByRole('button', { name: 'Copy to clipboard' })).toBeInTheDocument();
    expect(statusRegion).toHaveTextContent('');
  });

  it('renders as a menuitem when buttonStyle is menu and copies on click', async () => {
    render(
      <TestContext>
        <CopyButton text="my-secret-value" buttonStyle="menu" />
      </TestContext>
    );

    const menuItem = screen.getByRole('menuitem', { name: 'Copy to clipboard' });

    await act(async () => {
      fireEvent.click(menuItem);
      await Promise.resolve();
    });

    expect(writeTextMock).toHaveBeenCalledWith('my-secret-value');
    expect(screen.getByRole('menuitem', { name: 'Copied!' })).toBeInTheDocument();
  });

  it('forwards custom iconButtonProps to ActionButton', () => {
    render(
      <TestContext>
        <CopyButton
          text="pod-name"
          iconButtonProps={{ 'aria-label': 'Copy pod name', disabled: true }}
        />
      </TestContext>
    );

    const button = screen.getByRole('button', { name: 'Copy pod name' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(writeTextMock).not.toHaveBeenCalled();
  });

  it('handles clipboard write failures gracefully without marking as copied', async () => {
    const error = new Error('Clipboard access denied');
    writeTextMock.mockRejectedValueOnce(error);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <TestContext>
        <CopyButton text="secret-token" />
      </TestContext>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
      await Promise.resolve();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to copy to clipboard:', error);
    expect(screen.getByRole('button', { name: 'Copy to clipboard' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('clears the pending reset timer when unmounted', async () => {
    vi.useFakeTimers();

    const { unmount } = render(
      <TestContext>
        <CopyButton text="cleanup-test" />
      </TestContext>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
      await Promise.resolve();
    });

    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
