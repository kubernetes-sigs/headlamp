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

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../../test';
import CopyableCell from './CopyableCell';

describe('CopyableCell', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.useFakeTimers();
    writeText.mockClear();
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('copies the value and shows copied feedback', async () => {
    render(
      <TestContext>
        <CopyableCell value="10.0.0.1">10.0.0.1</CopyableCell>
      </TestContext>
    );

    fireEvent.click(screen.getByRole('button', { name: 'translation|Copy to clipboard' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('10.0.0.1'));
    expect(screen.getByRole('button', { name: 'translation|Copied!' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'translation|Copy to clipboard' })
      ).toBeInTheDocument()
    );
  });

  it('renders children without a copy button when the value is empty', () => {
    render(
      <TestContext>
        <CopyableCell value="">empty</CopyableCell>
      </TestContext>
    );

    expect(screen.getByText('empty')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'translation|Copy to clipboard' })
    ).not.toBeInTheDocument();
  });
});
