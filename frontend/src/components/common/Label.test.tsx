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
import { describe, expect, it, vi } from 'vitest';
import { timeAgo } from '../../lib/util';
import { TestContext } from '../../test';
import { DateLabel } from './Label';

vi.mock('../../lib/util', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/util')>();

  return {
    ...actual,
    timeAgo: vi.fn((date: string) => `time ago for ${date}`),
  };
});

describe('DateLabel', () => {
  it('updates the relative time when the date prop changes without remounting', () => {
    const firstDate = '2026-05-08T10:00:00.000Z';
    const secondDate = '2026-05-08T10:01:00.000Z';

    const { rerender } = render(
      <TestContext>
        <DateLabel date={firstDate} />
      </TestContext>
    );

    expect(screen.getByText(`time ago for ${firstDate}`)).toBeInTheDocument();

    rerender(
      <TestContext>
        <DateLabel date={secondDate} />
      </TestContext>
    );

    expect(screen.getByText(`time ago for ${secondDate}`)).toBeInTheDocument();
    expect(screen.queryByText(`time ago for ${firstDate}`)).not.toBeInTheDocument();
    expect(timeAgo).toHaveBeenLastCalledWith(secondDate, { format: 'brief' });
  });
});
