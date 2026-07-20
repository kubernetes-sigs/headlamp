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

import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import clusterProviderReducer, {
  type ClusterStatusComponent,
} from '../../../redux/clusterProviderSlice';
import { ClusterStatus } from './ClusterTable';

vi.mock('react-i18next', async importOriginal => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { changeLanguage: vi.fn() },
    }),
  };
});

vi.mock('@mui/material/styles', async importOriginal => {
  const actual = await importOriginal<typeof import('@mui/material/styles')>();
  return {
    ...actual,
    useTheme: () => ({
      palette: {
        home: { status: { error: '#f00', success: '#0f0', unknown: '#999' } },
        common: { primary: '#00f' },
      },
      spacing: (n: number) => `${n * 8}px`,
    }),
  };
});

function makeStore(clusterStatuses: ClusterStatusComponent[]) {
  return configureStore({
    reducer: { clusterProvider: clusterProviderReducer },
    preloadedState: {
      clusterProvider: {
        dialogs: [],
        menuItems: [],
        clusterProviders: [],
        clusterStatuses,
      },
    },
    // clusterStatuses holds functions, which aren't serializable; matches the app's
    // own store config (redux/stores/store.tsx), which disables this check too.
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });
}

const mockCluster = { name: 'test-cluster', server: 'https://k8s.example.com' } as any;

// isConnected=true and error=null bypass the "Not connected" / "Connecting…" states
// so the callback loop and the default active-status fallback are exercised directly.
const connectedProps = { isConnected: true, onConnect: vi.fn(), error: null };

describe('ClusterStatus — registerClusterStatus callback loop', () => {
  it('renders the first non-null callback result and skips null-returning callbacks', () => {
    const firstReturnsNull: ClusterStatusComponent = () => null;
    const secondReturnsChip: ClusterStatusComponent = () => (
      <span data-testid="custom-status">SSO Active</span>
    );

    render(
      <Provider store={makeStore([firstReturnsNull, secondReturnsChip])}>
        <ClusterStatus cluster={mockCluster} {...connectedProps} />
      </Provider>
    );

    expect(screen.getByTestId('custom-status')).toBeInTheDocument();
  });

  it('falls through to the default status when all callbacks return null', () => {
    const alwaysNull: ClusterStatusComponent = () => null;

    render(
      <Provider store={makeStore([alwaysNull])}>
        <ClusterStatus cluster={mockCluster} {...connectedProps} />
      </Provider>
    );

    // No custom chip rendered
    expect(screen.queryByTestId('custom-status')).not.toBeInTheDocument();
    // Default active-state label is rendered (isConnected + error === null → "Active")
    expect(screen.getByText('translation|Active')).toBeInTheDocument();
  });

  it('skips a throwing callback and falls through to the next one', () => {
    // The component logs the caught error via console.error; silence it here so the
    // expected failure mode doesn't spam test output, and assert it was still logged.
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const throwingCallback: ClusterStatusComponent = () => {
      throw new Error('hooks called outside component');
    };
    const recoveryCallback: ClusterStatusComponent = () => (
      <span data-testid="recovery-status">Recovery</span>
    );

    // Should not throw; the error is caught and the loop continues
    render(
      <Provider store={makeStore([throwingCallback, recoveryCallback])}>
        <ClusterStatus cluster={mockCluster} {...connectedProps} />
      </Provider>
    );

    expect(screen.getByTestId('recovery-status')).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ClusterStatus] A registerClusterStatus callback threw.'),
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('skips a callback that returns undefined and falls through to the next one', () => {
    const returnsUndefined: ClusterStatusComponent = () => undefined as any;
    const recoveryCallback: ClusterStatusComponent = () => (
      <span data-testid="recovery-status">Recovery</span>
    );

    render(
      <Provider store={makeStore([returnsUndefined, recoveryCallback])}>
        <ClusterStatus cluster={mockCluster} {...connectedProps} />
      </Provider>
    );

    expect(screen.getByTestId('recovery-status')).toBeInTheDocument();
  });

  it('uses only the first non-null callback; subsequent ones never run', () => {
    const secondSpy = vi.fn(() => <span data-testid="second">Second</span>);
    const firstReturnsChip: ClusterStatusComponent = () => <span data-testid="first">First</span>;

    render(
      <Provider store={makeStore([firstReturnsChip, secondSpy])}>
        <ClusterStatus cluster={mockCluster} {...connectedProps} />
      </Provider>
    );

    expect(screen.getByTestId('first')).toBeInTheDocument();
    expect(screen.queryByTestId('second')).not.toBeInTheDocument();
    expect(secondSpy).not.toHaveBeenCalled();
  });
});
