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

import { ThemeProvider } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import reducers from '../../redux/reducers/reducers';
import { TestContext } from '../../test';
import defaultAppThemes from '../App/defaultAppThemes';
import SectionFilterHeader from './SectionFilterHeader';

const theme = createMuiTheme(defaultAppThemes[0]);

function Header({ actions }: { actions: React.ReactNode[] }) {
  return <SectionFilterHeader title="Pods" actions={actions} />;
}

describe('SectionFilterHeader', () => {
  beforeEach(() => {
    // Allowed namespaces make the autocomplete use them as options without fetching.
    localStorage.setItem(
      'cluster_settings.test',
      JSON.stringify({ allowedNamespaces: ['alpha', 'beta', 'gamma'] })
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
});
