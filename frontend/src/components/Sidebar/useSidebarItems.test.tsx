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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import App from '../../App';
import reducers from '../../redux/reducers/reducers';
import { TestContext } from '../../test';
import { DefaultSidebars, SidebarEntry } from './sidebarSlice';
import { useSidebarItems } from './useSidebarItems';

// Fix for a circular dependency issue
// App import will load the whole app dependency tree
// And assigning it to a value will make sure it's not tree-shaken and removed
// eslint-disable-next-line no-unused-vars
const DontDeleteMe = App;

describe('useSidebarItems', () => {
  const mockStore = (
    customSidebarEntries: { [name: string]: SidebarEntry },
    customSidebarFilters: ((entry: SidebarEntry) => SidebarEntry | null)[]
  ) => {
    return configureStore({
      reducer: reducers,
      preloadedState: {
        sidebar: {
          entries: customSidebarEntries,
          filters: customSidebarFilters,
          selected: { item: null, sidebar: DefaultSidebars.IN_CLUSTER },
          isVisible: true,
        },
      },
    });
  };
  const queryClient = new QueryClient();

  const wrapper =
    (store: any) =>
    ({ children }: any) =>
      (
        <TestContext>
          <Provider store={store}>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
          </Provider>
        </TestContext>
      );

  it('should include customSidebarEntries', () => {
    const customEntries = {
      custom1: {
        name: 'custom1',
        label: 'Custom 1',
        url: '/custom1',
      },
      custom2: {
        name: 'custom2',
        label: 'Custom 2',
        url: '/custom2',
        parent: 'custom1',
      },
      outoforder: {
        name: 'outoforder',
        label: 'outoforder',
        url: '/outoforder',
        parent: 'custom3',
      },
      custom3: {
        name: 'custom3',
        label: 'Custom 3',
        url: '/custom3',
        parent: 'custom2',
      },
    };

    const store = mockStore(customEntries, []);
    const { result } = renderHook(() => useSidebarItems(), {
      wrapper: wrapper(store),
    });

    expect(result.current.find(it => it.name === 'custom1')).toMatchInlineSnapshot(`
      {
        "label": "Custom 1",
        "name": "custom1",
        "subList": [
          {
            "label": "Custom 2",
            "name": "custom2",
            "parent": "custom1",
            "subList": [
              {
                "label": "Custom 3",
                "name": "custom3",
                "parent": "custom2",
                "subList": [
                  {
                    "label": "outoforder",
                    "name": "outoforder",
                    "parent": "custom3",
                    "url": "/outoforder",
                  },
                ],
                "url": "/custom3",
              },
            ],
            "url": "/custom2",
          },
        ],
        "url": "/custom1",
      }
    `);
  });

  it('should add entries to existing items', () => {
    const customEntries = {
      custom1: {
        name: 'custom1',
        label: 'Custom 1',
        url: '/custom1',
        parent: 'storage',
      },
    };

    const store = mockStore(customEntries, []);
    const { result } = renderHook(() => useSidebarItems(), {
      wrapper: wrapper(store),
    });

    expect(
      result.current
        .find(it => it.name === customEntries.custom1.parent)
        ?.subList?.find(it => it.name === customEntries.custom1.name)
    ).toBeDefined();
  });

  it('should apply customSidebarFilters', () => {
    const customEntries = {
      custom1: { name: 'custom1', label: 'Custom 1', url: '/custom1' },
      custom2: { name: 'custom2', label: 'Custom 2', url: '/custom2' },
    };
    const customFilters = [(entry: SidebarEntry) => (entry.name === 'custom2' ? null : entry)];

    const store = mockStore(customEntries, customFilters);
    const { result } = renderHook(() => useSidebarItems(), {
      wrapper: wrapper(store),
    });

    expect(result.current).toEqual(
      expect.arrayContaining([{ name: 'custom1', label: 'Custom 1', url: '/custom1' }])
    );
    expect(result.current).not.toEqual(
      expect.arrayContaining([{ name: 'custom2', label: 'Custom 2', url: '/custom2' }])
    );
  });
});
