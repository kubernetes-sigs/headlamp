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
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import filterReducer from '../../redux/filterSlice';
import { TestContext } from '../../test';
import SectionFilterHeader, { SectionFilterHeaderProps } from './SectionFilterHeader';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|')[1] || key,
  }),
}));

vi.mock('./NamespacesAutocomplete', () => ({
  NamespacesAutocomplete: () => (
    <div data-testid="namespaces-autocomplete">NamespacesAutocomplete</div>
  ),
}));

const theme = createMuiTheme({ base: 'light', name: 'light' });

function makeStore(namespaces: string[] = []) {
  return configureStore({
    reducer: {
      filter: filterReducer,
    },
    preloadedState: {
      filter: {
        namespaces: new Set(namespaces),
      },
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });
}

function renderComponent(
  props: Partial<SectionFilterHeaderProps> = {},
  store = makeStore(),
  urlSearchParams?: Record<string, string>
) {
  const defaultProps: SectionFilterHeaderProps = {
    title: 'Pods',
  };

  return {
    ...render(
      <TestContext store={store as any} urlSearchParams={urlSearchParams}>
        <ThemeProvider theme={theme}>
          <SectionFilterHeader {...defaultProps} {...props} />
        </ThemeProvider>
      </TestContext>
    ),
    store,
  };
}

describe('SectionFilterHeader', () => {
  describe('URL namespace synchronization', () => {
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

    it('deduplicates repeating namespaces from URL parameter', () => {
      const store = makeStore([]);
      renderComponent({}, store, { namespace: 'default default kube-system' });

      expect(store.getState().filter.namespaces).toEqual(new Set(['default', 'kube-system']));
    });

    it('does not dispatch when store already matches URL namespaces', () => {
      const store = makeStore(['default', 'kube-system']);
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      renderComponent({}, store, { namespace: 'default kube-system' });

      // setNamespaceFilter should not have been dispatched
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
  });

  describe('Namespace filter visibility', () => {
    it('renders NamespacesAutocomplete by default', () => {
      renderComponent();
      expect(screen.getByTestId('namespaces-autocomplete')).toBeInTheDocument();
    });

    it('does not render NamespacesAutocomplete when noNamespaceFilter is true', () => {
      renderComponent({ noNamespaceFilter: true });
      expect(screen.queryByTestId('namespaces-autocomplete')).not.toBeInTheDocument();
    });
  });

  describe('Header actions composition', () => {
    it('renders custom actions, preRenderFromFilterActions, and NamespacesAutocomplete together', () => {
      renderComponent({
        actions: [<Button key="custom-act">Custom Action</Button>],
        preRenderFromFilterActions: [<Button key="pre-act">Pre Action</Button>],
      });

      expect(screen.getByText('Custom Action')).toBeInTheDocument();
      expect(screen.getByText('Pre Action')).toBeInTheDocument();
      expect(screen.getByTestId('namespaces-autocomplete')).toBeInTheDocument();
    });
  });
});
