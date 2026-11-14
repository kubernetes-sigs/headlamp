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

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClusterSelector from './ClusterSelector';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('react-router-dom', () => ({ useHistory: () => ({ replace }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('ClusterSelector navigation', () => {
  afterEach(() => {
    cleanup();
    replace.mockClear();
  });

  it.each(['test+qa', 'test&qa', 'test#qa', 'test%2Fqa'])(
    'keeps selected cluster %s intact in the destination URL',
    cluster => {
      render(<ClusterSelector currentCluster="production" clusters={['production', cluster]} />);
      fireEvent.mouseDown(screen.getByRole('combobox'));
      fireEvent.click(screen.getByRole('option', { name: cluster }));

      expect(replace).toHaveBeenCalledOnce();
      const url = new URL(replace.mock.calls[0][0], 'http://localhost');
      expect(url.pathname).toBe('/settings/cluster');
      expect([...url.searchParams.entries()]).toEqual([['c', cluster]]);
      expect(url.hash).toBe('');
    }
  );

  it('still navigates to a cluster with an ordinary name', () => {
    render(<ClusterSelector currentCluster="one" clusters={['one', 'two']} />);
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'two' }));
    expect(replace).toHaveBeenCalledWith('/settings/cluster?c=two');
  });
});
