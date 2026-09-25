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

import Button from '@mui/material/Button';
import { ThemeProvider } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import reducers from '../../redux/reducers/reducers';
import { TestContext } from '../../test';
import defaultAppThemes from '../App/defaultAppThemes';
import SectionFilterHeader, { SectionFilterHeaderProps } from './SectionFilterHeader';

const theme = createMuiTheme(defaultAppThemes[0]);

function Header({ actions }: { actions: React.ReactNode[] }) {
  return <SectionFilterHeader title="Pods" actions={actions} />;
}

describe('SectionFilterHeader', () => {
  beforeEach(() => {
    // Allowed namespaces make the autocomplete use them as options without fetching.
    localStorage.setItem(
      'cluster_settings.test',
      JSON.stringify({
        allowedNamespaces: ['alpha', 'beta', 'gamma', 'default', 'kube-system', 'monitoring'],
      })
    );
    window.history.pushState({}, '', '/c/test/pods');
  });

  afterEach(() => {
    localStorage.removeItem('cluster_settings.test');
  });

  it('keeps the namespace popup open when other actions appear or disappear', async () => {
    const store = configureStore({
      reducer: reducers,
      preloadedState: { filter: { namespaces: new Set(), search: '' } } as any,
      middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
    });
    const queryClient = new QueryClient();
    const wrap = (actions: React.ReactNode[]) => (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <TestContext store={store} routerMap={{ cluster: 'test' }} urlPrefix="/c">
            <Header actions={actions} />
          </TestContext>
        </ThemeProvider>
      </QueryClientProvider>
    );

    const { rerender } = render(wrap([]));
    fireEvent.mouseDown(await screen.findByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'alpha' }));
    expect(screen.queryByRole('listbox')).not.toBeNull();

    // e.g. the pod list shows a "Load more" action only when there are more pages.
    rerender(wrap([<button key="load-more">Load more</button>]));
    expect(screen.queryByRole('listbox')).not.toBeNull();

    rerender(wrap([]));
    expect(screen.queryByRole('listbox')).not.toBeNull();
  });

  describe('URL namespace synchronization', () => {
    function makeStore(namespaces: string[] = []) {
      return configureStore({
        reducer: reducers,
        preloadedState: {
          filter: {
            namespaces: new Set(namespaces),
            search: '',
          },
        } as any,
        middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
      });
    }

    function renderComponent(
      props: Partial<SectionFilterHeaderProps> = {},
      store = makeStore(),
      urlSearchParams?: Record<string, string>
    ) {
      const queryClient = new QueryClient();
      return {
        ...render(
          <QueryClientProvider client={queryClient}>
            <ThemeProvider theme={theme}>
              <TestContext
                store={store}
                routerMap={{ cluster: 'test' }}
                urlPrefix="/c"
                urlSearchParams={urlSearchParams}
              >
                <SectionFilterHeader title="Pods" {...props} />
              </TestContext>
            </ThemeProvider>
          </QueryClientProvider>
        ),
        store,
      };
    }

    it('synchronizes URL namespaces when URL has namespaces overlapping with current store', () => {
      // Current store has 'default', URL has 'default' and 'kube-system'
      const store = makeStore(['default']);
      renderComponent({}, store, { namespace: 'default kube-system' });

      expect(store.getState().filter.namespaces).toEqual(new Set(['default', 'kube-system']));
    });

    it('synchronizes URL namespaces when store initially has no namespaces', () => {
      const store = makeStore([]);
      renderComponent({}, store, { namespace: 'default monitoring' });

      expect(store.getState().filter.namespaces).toEqual(new Set(['default', 'monitoring']));
    });

    it('handles multiple and trailing spaces in URL parameter without creating empty namespaces', () => {
      const store = makeStore([]);
      renderComponent({}, store, { namespace: 'default   kube-system ' });

      expect(store.getState().filter.namespaces).toEqual(new Set(['default', 'kube-system']));
    });

    it('does not dispatch when URL contains duplicate namespaces that match store', () => {
      const store = makeStore(['default', 'kube-system']);
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      renderComponent({}, store, { namespace: 'default default kube-system' });

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('does not dispatch when store already matches URL namespaces', () => {
      const store = makeStore(['default', 'kube-system']);
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      renderComponent({}, store, { namespace: 'default kube-system' });

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('does not dispatch when URL namespaces match store in different order', () => {
      const store = makeStore(['default', 'kube-system']);
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      renderComponent({}, store, { namespace: 'kube-system default' });

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('leaves store unchanged when no namespace parameter is in URL', () => {
      const store = makeStore(['default']);
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      renderComponent({}, store);

      expect(store.getState().filter.namespaces).toEqual(new Set(['default']));
      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('renders NamespacesAutocomplete by default', () => {
      renderComponent();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('does not render NamespacesAutocomplete when noNamespaceFilter is true', () => {
      renderComponent({ noNamespaceFilter: true });
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('renders custom actions, preRenderFromFilterActions, and NamespacesAutocomplete together', () => {
      renderComponent({
        actions: [<Button key="custom-act">Custom Action</Button>],
        preRenderFromFilterActions: [<Button key="pre-act">Pre Action</Button>],
      });

      expect(screen.getByText('Custom Action')).toBeInTheDocument();
      expect(screen.getByText('Pre Action')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });
});
