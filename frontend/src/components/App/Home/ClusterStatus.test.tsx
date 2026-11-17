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
import { act, useReducer, useState } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import clusterProviderReducer, {
  addClusterStatus,
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
  const actual: any = await importOriginal();
  return {
    ...actual,
    useTheme: () => ({
      palette: {
        home: { status: { error: '#f00', success: '#0f0', unknown: '#999' } },
        common: { primary: '#00f' },
        text: { secondary: '#555' },
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
        clusterEmptyState: null,
        deleteHandlers: [],
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
  it('first callback returns null, second returns a chip — chip shown', () => {
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

  it('all callbacks return null — no chip, default "Active" text shown', () => {
    const alwaysNull: ClusterStatusComponent = () => null;

    render(
      <Provider store={makeStore([alwaysNull])}>
        <ClusterStatus cluster={mockCluster} {...connectedProps} />
      </Provider>
    );

    expect(screen.queryByTestId('custom-status')).not.toBeInTheDocument();
    expect(screen.getByText('translation|Active')).toBeInTheDocument();
  });

  it('no callbacks registered — default "Active" shown', () => {
    render(
      <Provider store={makeStore([])}>
        <ClusterStatus cluster={mockCluster} {...connectedProps} />
      </Provider>
    );

    expect(screen.getByText('translation|Active')).toBeInTheDocument();
  });

  it('first returns a chip, second is a spy — second never called', () => {
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

  it('chain is built lazily: callbacks after the one that matches are never looked up', () => {
    // Builds the remaining chain only when a link falls through or throws. An eager
    // chain would read every later callback (to key its boundary) at every link,
    // which is quadratic in the number of registered callbacks.
    const callbacks: ClusterStatusComponent[] = [
      () => null,
      () => <span data-testid="second">Second</span>,
      ...Array.from({ length: 8 }, () => () => null),
    ];
    const readIndexes = new Set<number>();
    const tracked = new Proxy(callbacks, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          readIndexes.add(Number(prop));
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const store = makeStore(tracked);
    // Only count reads made while rendering, not by the store's own setup checks.
    readIndexes.clear();
    render(
      <Provider store={store}>
        <ClusterStatus cluster={mockCluster} {...connectedProps} />
      </Provider>
    );

    expect(screen.getByTestId('second')).toBeInTheDocument();
    expect([...readIndexes].sort()).toEqual([0, 1]);
  });

  it('callback returns undefined — falls through to next callback chip', () => {
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

  it('callback throws — next callback chip is shown', () => {
    // ErrorBoundary and React both log the caught error; silence output so the
    // expected failure mode does not spam the test runner.
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const throwingCallback: ClusterStatusComponent = () => {
      throw new Error('callback failed');
    };
    const recoveryCallback: ClusterStatusComponent = () => (
      <span data-testid="recovery-status">Recovery</span>
    );

    render(
      <Provider store={makeStore([throwingCallback, recoveryCallback])}>
        <ClusterStatus cluster={mockCluster} {...connectedProps} />
      </Provider>
    );

    expect(screen.getByTestId('recovery-status')).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('hooks are legal: useState callback renders after rerender with same props and different cluster', () => {
    let count = 0;
    const HookCb: ClusterStatusComponent = () => {
      const [value] = useState(() => `hooked-${count++}`);
      return <span data-testid="hooked">{value}</span>;
    };

    const store = makeStore([HookCb]);
    const { rerender } = render(
      <Provider store={store}>
        <ClusterStatus cluster={mockCluster} {...connectedProps} />
      </Provider>
    );

    expect(screen.getByTestId('hooked')).toHaveTextContent('hooked-0');

    // Rerender with same props — hook state must be stable.
    rerender(
      <Provider store={store}>
        <ClusterStatus cluster={mockCluster} {...connectedProps} />
      </Provider>
    );
    expect(screen.getByTestId('hooked')).toHaveTextContent('hooked-0');

    // Rerender with a different cluster object — callback receives new props,
    // but its hook instance must remain mounted without throwing.
    const otherCluster = { name: 'other-cluster', server: 'https://other.example.com' } as any;
    rerender(
      <Provider store={store}>
        <ClusterStatus cluster={otherCluster} {...connectedProps} />
      </Provider>
    );
    // Same instance (no remount): the lazy initializer ran only once.
    expect(screen.getByTestId('hooked')).toHaveTextContent('hooked-0');
  });

  it('hooks + fall-through: hook-using null callback before chip callback — chip shown after rerender', () => {
    const HookNullCb: ClusterStatusComponent = () => {
      const [on] = useState(false);
      return on ? <i /> : null;
    };
    const ChipCb: ClusterStatusComponent = () => <span data-testid="hook-chain-chip">chip</span>;

    const store = makeStore([HookNullCb, ChipCb]);
    const { rerender } = render(
      <Provider store={store}>
        <ClusterStatus cluster={mockCluster} {...connectedProps} />
      </Provider>
    );

    expect(screen.getByTestId('hook-chain-chip')).toBeInTheDocument();

    rerender(
      <Provider store={store}>
        <ClusterStatus cluster={mockCluster} {...connectedProps} />
      </Provider>
    );
    expect(screen.getByTestId('hook-chain-chip')).toBeInTheDocument();
  });

  it('registration change: a callback inserted ahead of hook-using callbacks does not inherit their hook state', () => {
    // Callbacks with different hook counts. Keying links by index would hand
    // HookNullCb's hook state to TwoHookCb and make React throw.
    const HookNullCb: ClusterStatusComponent = () => {
      const [on] = useState(false);
      return on ? <i /> : null;
    };
    const HookChipCb: ClusterStatusComponent = () => {
      const [label] = useState('chip-from-hook');
      return <span data-testid="hook-chip">{label}</span>;
    };
    const TwoHookCb: ClusterStatusComponent = () => {
      const [a] = useState(0);
      const [b] = useReducer((x: number) => x, 0);
      return a + b > 0 ? <i /> : null;
    };

    // Test-only reducer wrapper so the registered list can be reordered in
    // place (the slice itself only appends), keeping the same mounted tree.
    const store = configureStore({
      reducer: {
        clusterProvider: (state: any, action: any) =>
          action.type === 'test/setStatuses'
            ? { ...state, clusterStatuses: action.payload }
            : clusterProviderReducer(state, action),
      },
      preloadedState: makeStore([HookNullCb, HookChipCb]).getState(),
      middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
    });

    render(
      <Provider store={store}>
        <ClusterStatus cluster={mockCluster} {...connectedProps} />
      </Provider>
    );
    expect(screen.getByTestId('hook-chip')).toBeInTheDocument();

    // The ErrorBoundary would hide a hook-order crash behind the fall-through,
    // so assert that React reported no error at all.
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => {
      store.dispatch({ type: 'test/setStatuses', payload: [TwoHookCb, HookNullCb, HookChipCb] });
    });
    expect(screen.getByTestId('hook-chip')).toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();

    // A runtime registration through the real slice action keeps working too.
    act(() => {
      store.dispatch(addClusterStatus(() => null));
    });
    expect(screen.getByTestId('hook-chip')).toBeInTheDocument();
  });
});
