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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import Endpoints from '../../lib/k8s/endpoints';
import { KubeObject } from '../../lib/k8s/KubeObject';
import Pod from '../../lib/k8s/pod';
import { setConfig } from '../../redux/configSlice';
import { setDetailDrawerEnabled } from '../../redux/drawerModeSlice';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import { setTheme } from '../App/themeSlice';
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

describe('GlobalSearchContent resource results', () => {
  let currentPath = '';

  function LocationProbe() {
    currentPath = useLocation().pathname;
    return null;
  }

  function mockList(cls: typeof KubeObject<any>, items: KubeObject[]) {
    vi.spyOn(KubeObject, 'useList').mockImplementation(function (this: any) {
      const list = this === cls ? items : [];
      return { items: list, data: { items: list }, isFetching: false } as any;
    });
  }

  function metadata(name: string, cluster: string) {
    return {
      name,
      namespace: 'default',
      uid: `${cluster}-${name}`,
      creationTimestamp: '2026-01-01T00:00:00Z',
    };
  }

  function makePod(name: string, cluster: string) {
    return new Pod(
      {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: metadata(name, cluster),
        spec: { containers: [] },
        status: {},
      } as any,
      cluster
    );
  }

  async function openFromSearch(startPath: string, kind: string, name: string) {
    window.history.pushState({}, '', startPath);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Provider store={store}>
          <MemoryRouter initialEntries={[startPath]}>
            <GlobalSearchContent defaultValue="" maxWidth={500} onBlur={() => {}} />
            <LocationProbe />
          </MemoryRouter>
        </Provider>
      </QueryClientProvider>
    );

    await userEvent.type(screen.getByRole('combobox'), name);
    await userEvent.click(
      await screen.findByRole('option', { name: new RegExp(`${kind} • default.*${name}`) })
    );
  }

  beforeEach(() => {
    localStorage.clear();
    currentPath = '';
    store.dispatch(setDetailDrawerEnabled(false));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
  });

  it("opens a pod's full-page details in the pod's own cluster", async () => {
    mockList(Pod, [makePod('bravo-only-pod', 'bravo')]);

    await openFromSearch('/c/alpha+bravo/pods', 'Pod', 'bravo-only-pod');

    await waitFor(() => expect(currentPath).toBe('/c/bravo+alpha/pods/default/bravo-only-pod'));
  });

  it('keeps the cluster order for a pod from the first cluster', async () => {
    mockList(Pod, [makePod('alpha-only-pod', 'alpha')]);

    await openFromSearch('/c/alpha+bravo/pods', 'Pod', 'alpha-only-pod');

    await waitFor(() => expect(currentPath).toBe('/c/alpha+bravo/pods/default/alpha-only-pod'));
  });

  it('opens a pod in a single selected cluster', async () => {
    mockList(Pod, [makePod('solo-pod', 'alpha')]);

    await openFromSearch('/c/alpha/pods', 'Pod', 'solo-pod');

    await waitFor(() => expect(currentPath).toBe('/c/alpha/pods/default/solo-pod'));
  });

  it('opens the details page, not the list, for an Endpoints result', async () => {
    const endpoints = new Endpoints(
      { apiVersion: 'v1', kind: 'Endpoints', metadata: metadata('my-svc', 'bravo') } as any,
      'bravo'
    );
    mockList(Endpoints, [endpoints]);

    await openFromSearch('/c/alpha+bravo/pods', 'Endpoints', 'my-svc');

    await waitFor(() => expect(currentPath).toBe('/c/bravo+alpha/endpoints/default/my-svc'));
  });
});
