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
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import Pod from '../../lib/k8s/pod';
import { setConfig } from '../../redux/configSlice';
import { initialState as configInitialState } from '../../redux/configSlice';
import reducers from '../../redux/reducers/reducers';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import { generateK8sResourceList } from '../../test/mocker';
import { setTheme } from '../App/themeSlice';
import { podList } from '../pod/storyHelper';
import { GlobalSearchContent } from './GlobalSearchContent';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const PREFERRED_DARK_THEME_KEY = 'headlampPreferredDarkTheme';
const REMEMBER_THEME_CHOICES_KEY = 'headlampRememberThemeChoices';

function renderSearch() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TestContext>
        <GlobalSearchContent defaultValue="" maxWidth={500} onBlur={() => {}} />
      </TestContext>
    </QueryClientProvider>
  );
}

async function pickThemeFromSearch(name: string) {
  await userEvent.type(screen.getByRole('combobox'), name);
  await userEvent.click(await screen.findByRole('option', { name: `Theme ${name}` }));
}

describe('GlobalSearchContent theme actions', () => {
  beforeEach(() => {
    localStorage.clear();
    store.dispatch(setTheme('Light'));
  });

  afterEach(() => {
    localStorage.clear();
    store.dispatch(
      setConfig({ clusters: store.getState().config.clusters, forceTheme: undefined })
    );
  });

  it('remembers a theme picked from search as the quick swap preference', async () => {
    renderSearch();

    await pickThemeFromSearch('Lights Out');

    expect(store.getState().theme.name).toBe('Lights Out');
    expect(localStorage.getItem(PREFERRED_DARK_THEME_KEY)).toBe('Lights Out');
  });

  it('does not store a preference when remember mode is off', async () => {
    localStorage.setItem(REMEMBER_THEME_CHOICES_KEY, 'false');
    renderSearch();

    await pickThemeFromSearch('Lights Out');

    expect(store.getState().theme.name).toBe('Lights Out');
    expect(localStorage.getItem(PREFERRED_DARK_THEME_KEY)).toBeNull();
  });

  it('does not offer to switch themes while a theme is forced', async () => {
    store.dispatch(setConfig({ clusters: store.getState().config.clusters, forceTheme: 'Dark' }));
    renderSearch();

    await userEvent.type(screen.getByRole('combobox'), 'Lights Out');

    await expect(
      screen.findByRole('option', { name: 'Theme Lights Out' }, { timeout: 500 })
    ).rejects.toThrow();
    expect(localStorage.getItem(PREFERRED_DARK_THEME_KEY)).toBeNull();
  });
});

describe('GlobalSearchContent cluster labels', () => {
  it('identifies same-name Pods from different clusters', async () => {
    const makePod = (cluster: string) => {
      const [pod] = generateK8sResourceList(
        {
          ...podList[5],
          metadata: {
            ...podList[5].metadata,
            name: 'duplicate-pod',
            namespace: 'default',
          },
        },
        {
          instantiateAs: Pod,
          numResults: 1,
          uidPrefix: `pod-${cluster}-`,
        }
      );

      pod.cluster = cluster;
      return pod;
    };

    const longCluster = 'gke_my-company-project_us-central1-a_production-cluster';
    const pods = [makePod('alpha'), makePod(longCluster)];

    const alpha = { name: 'alpha', auth_type: '' };
    const longClusterConfig = { name: longCluster, auth_type: '' };

    const testStore = configureStore({
      reducer: reducers,
      preloadedState: {
        config: {
          ...configInitialState,
          clusters: {
            alpha,
            [longCluster]: longClusterConfig,
          },
          allClusters: {
            alpha,
            [longCluster]: longClusterConfig,
          },
        },
      },
    });

    vi.spyOn(Pod, 'useList').mockReturnValue({
      items: pods,
      isFetching: false,
    } as unknown as ReturnType<typeof Pod.useList>);

    try {
      render(
        <TestContext
          store={testStore}
          routerMap={{ cluster: `alpha+${longCluster}` }}
          urlPrefix="/c"
        >
          <QueryClientProvider client={new QueryClient()}>
            <GlobalSearchContent defaultValue="duplicate-pod" maxWidth={500} onBlur={() => {}} />
          </QueryClientProvider>
        </TestContext>
      );

      const options = await screen.findAllByRole('option', {
        name: /duplicate-pod/,
      });

      const podResults = options.filter(option => option.textContent?.includes('Pod'));

      expect(podResults).toHaveLength(2);
      expect(podResults[0]).toHaveTextContent('duplicate-pod');
      expect(podResults[1]).toHaveTextContent('duplicate-pod');

      expect(podResults.filter(option => option.textContent?.includes('alpha'))).toHaveLength(1);
      expect(podResults.filter(option => option.textContent?.includes(longCluster))).toHaveLength(
        1
      );

      const captions = podResults.map(option => option.querySelector('.MuiTypography-noWrap'));

      expect(captions).toHaveLength(2);

      captions.forEach(caption => {
        expect(caption).not.toBeNull();
        expect(caption).toHaveAttribute('title', expect.stringContaining('Pod'));
        expect(caption).toHaveClass('MuiTypography-noWrap');
      });

      const tooltipTexts = captions.map(caption => caption?.getAttribute('title') ?? '');

      expect(tooltipTexts.some(text => text.includes('alpha'))).toBe(true);
      expect(tooltipTexts.some(text => text.includes(longCluster))).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('preserves the original result label for a single cluster', async () => {
    const [pod] = generateK8sResourceList(
      {
        ...podList[5],
        metadata: {
          ...podList[5].metadata,
          name: 'single-cluster-test-pod',
          namespace: 'default',
        },
      },
      {
        instantiateAs: Pod,
        numResults: 1,
        uidPrefix: 'single-cluster-test-',
      }
    );

    pod.cluster = 'alpha';

    const alpha = { name: 'alpha', auth_type: '' };

    const testStore = configureStore({
      reducer: reducers,
      preloadedState: {
        config: {
          ...configInitialState,
          clusters: { alpha },
          allClusters: { alpha },
        },
      },
    });

    vi.spyOn(Pod, 'useList').mockReturnValue({
      items: [pod],
      isFetching: false,
    } as unknown as ReturnType<typeof Pod.useList>);

    try {
      render(
        <TestContext store={testStore} routerMap={{ cluster: 'alpha' }} urlPrefix="/c">
          <QueryClientProvider client={new QueryClient()}>
            <GlobalSearchContent
              defaultValue="single-cluster-test-pod"
              maxWidth={500}
              onBlur={() => {}}
            />
          </QueryClientProvider>
        </TestContext>
      );

      const options = await screen.findAllByRole('option', {
        name: /single-cluster-test-pod/,
      });

      const podResults = options.filter(option => option.textContent?.includes('Pod'));

      expect(podResults).toHaveLength(1);
      expect(podResults[0].textContent).toContain('default');
      expect(podResults[0].textContent).not.toContain('alpha');
      expect(podResults[0].querySelector('.MuiTypography-noWrap')).toBeNull();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
