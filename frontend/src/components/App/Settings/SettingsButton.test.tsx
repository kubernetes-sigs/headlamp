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
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../../test';
import SettingsButton from './SettingsButton';

const mockHistoryPush = vi.fn();
const { mockGetCluster } = vi.hoisted(() => ({ mockGetCluster: vi.fn<() => string | null>() }));

vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useHistory: () => ({ push: mockHistoryPush }),
}));

vi.mock('../../../lib/cluster', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../lib/cluster')>()),
  getCluster: () => mockGetCluster(),
}));

vi.mock('../../../lib/router/createRouteURL', () => ({
  createRouteURL: (_route: string, params?: { cluster?: string }) =>
    `/c/${params?.cluster ?? ''}/settings/cluster`,
}));

describe('SettingsButton', () => {
  it('renders nothing when there is no active cluster', () => {
    mockGetCluster.mockReturnValue(null);
    const { container } = render(
      <TestContext>
        <SettingsButton />
      </TestContext>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an icon button when a cluster is active', () => {
    mockGetCluster.mockReturnValue('my-cluster');
    render(
      <TestContext>
        <SettingsButton />
      </TestContext>
    );
    // ActionButton renders an <button> (IconButton); Settings is its accessible description
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
  });

  it('navigates to cluster settings on click', async () => {
    mockGetCluster.mockReturnValue('my-cluster');
    render(
      <TestContext>
        <SettingsButton />
      </TestContext>
    );
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(mockHistoryPush).toHaveBeenCalledWith('/c/my-cluster/settings/cluster');
  });

  it('calls onClickExtra after navigation', async () => {
    mockGetCluster.mockReturnValue('my-cluster');
    const onClickExtra = vi.fn();
    render(
      <TestContext>
        <SettingsButton onClickExtra={onClickExtra} />
      </TestContext>
    );
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(onClickExtra).toHaveBeenCalledOnce();
  });

  it('does not have a nested interactive element (no role=button inside button)', () => {
    mockGetCluster.mockReturnValue('my-cluster');
    render(
      <TestContext>
        <SettingsButton />
      </TestContext>
    );
    const button = screen.getByRole('button', { name: /settings/i });
    // Verify there is no interactive descendant (no button nested inside the button)
    expect(button.querySelector('[role="button"], button')).toBeNull();
  });
});
