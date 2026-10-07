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
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, useHistory, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { createRouteURL } from '../../lib/router/createRouteURL';
import filterReducer from '../../redux/filterSlice';
import shortcutsReducer, { DEFAULT_SHORTCUTS } from '../../redux/shortcutsSlice';
import ResourceShortcuts, { buildResourceListTarget } from './ResourceShortcuts';

describe('DEFAULT_SHORTCUTS navigation hotkeys', () => {
  it('registers Pods and Deployments navigation shortcuts', () => {
    expect(DEFAULT_SHORTCUTS.NAVIGATE_TO_PODS.category).toBe('navigation');
    expect(DEFAULT_SHORTCUTS.NAVIGATE_TO_DEPLOYMENTS.category).toBe('navigation');
    expect(DEFAULT_SHORTCUTS.NAVIGATE_TO_PODS.labelKey).toBe('Go to Pods');
    expect(DEFAULT_SHORTCUTS.NAVIGATE_TO_DEPLOYMENTS.labelKey).toBe('Go to Deployments');
  });
});

describe('buildResourceListTarget', () => {
  it('adds single namespace', () => {
    expect(
      buildResourceListTarget({
        pathname: '/c/minikube/pods',
        namespaces: ['production'],
        currentSearch: '',
      })
    ).toEqual({ pathname: '/c/minikube/pods', search: '?namespace=production' });
  });

  it('adds multiple namespaces with plus encoding', () => {
    expect(
      buildResourceListTarget({
        pathname: '/c/minikube/pods',
        namespaces: ['a', 'b'],
        currentSearch: '',
      })
    ).toEqual({ pathname: '/c/minikube/pods', search: '?namespace=a+b' });
  });

  it('returns empty search when none selected', () => {
    expect(
      buildResourceListTarget({ pathname: '/c/minikube/pods', namespaces: [], currentSearch: '' })
    ).toEqual({ pathname: '/c/minikube/pods', search: '' });
  });

  it('skips namespace for cluster-scoped destination', () => {
    expect(
      buildResourceListTarget({
        pathname: '/c/minikube/nodes',
        namespaces: ['production'],
        currentSearch: '',
        namespaced: false,
      })
    ).toEqual({ pathname: '/c/minikube/nodes', search: '' });
  });

  it('preserves existing query params and overwrites stale namespace', () => {
    const preserved = buildResourceListTarget({
      pathname: '/c/minikube/pods',
      namespaces: ['x'],
      currentSearch: '?foo=bar',
    });
    expect(preserved.search).toContain('foo=bar');
    expect(preserved.search).toContain('namespace=x');

    expect(
      buildResourceListTarget({
        pathname: '/c/minikube/pods',
        namespaces: ['new'],
        currentSearch: '?namespace=old',
      })
    ).toEqual({ pathname: '/c/minikube/pods', search: '?namespace=new' });
  });

  it('removes stale namespace when selection cleared but keeps other params', () => {
    expect(
      buildResourceListTarget({
        pathname: '/c/minikube/pods',
        namespaces: [],
        currentSearch: '?namespace=old&foo=1',
      })
    ).toEqual({ pathname: '/c/minikube/pods', search: '?foo=1' });
  });
});

function LocationProbe() {
  const location = useLocation();
  const history = useHistory();
  return (
    <>
      <span data-testid="loc-pathname">{location.pathname}</span>
      <span data-testid="loc-search">{location.search}</span>
      <span data-testid="hist-length">{history.length}</span>
    </>
  );
}

function locPathname() {
  return screen.getByTestId('loc-pathname').textContent ?? '';
}

function locSearch() {
  return screen.getByTestId('loc-search').textContent ?? '';
}

function histLength() {
  return Number(screen.getByTestId('hist-length').textContent ?? '0');
}

function makeStore(namespaces: string[], shortcutKeys?: Record<string, string>) {
  const shortcuts = { ...DEFAULT_SHORTCUTS };
  for (const [id, key] of Object.entries(shortcutKeys ?? {})) {
    shortcuts[id] = { ...shortcuts[id], key };
  }
  return configureStore({
    reducer: { shortcuts: shortcutsReducer, filter: filterReducer },
    preloadedState: {
      shortcuts: { shortcuts, isShortcutsDialogOpen: false },
      filter: { namespaces: new Set(namespaces) },
    },
  });
}

function renderShortcuts(entry: string, store: ReturnType<typeof makeStore>, withInput = false) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[entry]}>
        <ResourceShortcuts />
        <LocationProbe />
        {withInput ? <input data-testid="field" /> : null}
      </MemoryRouter>
    </Provider>
  );
}

function setWindowPath(path: string) {
  window.history.pushState({}, '', path);
}

const PODS_COMBO = { key: 'p', code: 'KeyP', altKey: true, shiftKey: true };
const DEPLOYMENTS_COMBO = { key: 'd', code: 'KeyD', altKey: true, shiftKey: true };

describe('ResourceShortcuts navigation', () => {
  afterEach(() => {
    setWindowPath('/');
  });

  it('goes to the Pods list and keeps the selected namespace', () => {
    setWindowPath('/c/minikube/deployments');
    renderShortcuts('/c/minikube/deployments', makeStore(['production']));

    fireEvent.keyDown(document.body, PODS_COMBO);

    expect(locPathname()).toBe(createRouteURL('Pods'));
    expect(locPathname()).toBe('/c/minikube/pods');
    expect(locSearch()).toBe('?namespace=production');
  });

  it('goes to the Deployments list and keeps the selected namespace', () => {
    setWindowPath('/c/minikube/pods');
    renderShortcuts('/c/minikube/pods?namespace=production', makeStore(['production']));

    fireEvent.keyDown(document.body, DEPLOYMENTS_COMBO);

    expect(locPathname()).toBe(createRouteURL('Deployments'));
    expect(locPathname()).toBe('/c/minikube/deployments');
    expect(locSearch()).toBe('?namespace=production');
  });

  it('does not push a duplicate entry when already on the target URL', () => {
    setWindowPath('/c/minikube/pods');
    renderShortcuts('/c/minikube/pods?namespace=production', makeStore(['production']));

    fireEvent.keyDown(document.body, PODS_COMBO);

    expect(locPathname()).toBe('/c/minikube/pods');
    expect(locSearch()).toBe('?namespace=production');
    expect(histLength()).toBe(1);
  });

  it('preserves a multi-cluster route prefix', () => {
    setWindowPath('/c/cluster-a+cluster-b/deployments');
    renderShortcuts('/c/cluster-a+cluster-b/deployments', makeStore(['production']));

    fireEvent.keyDown(document.body, PODS_COMBO);

    expect(locPathname()).toBe('/c/cluster-a+cluster-b/pods');
    expect(locSearch()).toBe('?namespace=production');
  });

  it('does nothing when no cluster is selected', () => {
    setWindowPath('/');
    renderShortcuts('/', makeStore(['production']));

    fireEvent.keyDown(document.body, PODS_COMBO);

    expect(locPathname()).toBe('/');
    expect(histLength()).toBe(1);
  });

  it('does not fire while typing in an input', () => {
    setWindowPath('/c/minikube/deployments');
    const { getByTestId } = renderShortcuts(
      '/c/minikube/deployments',
      makeStore(['production']),
      true
    );

    (getByTestId('field') as HTMLInputElement).focus();
    fireEvent.keyDown(getByTestId('field'), PODS_COMBO);
    expect(locPathname()).toBe('/c/minikube/deployments');
    expect(histLength()).toBe(1);

    fireEvent.keyDown(document.body, PODS_COMBO);
    expect(locPathname()).toBe('/c/minikube/pods');
    expect(locSearch()).toBe('?namespace=production');
  });

  it('honors a user-customized key from the store', () => {
    setWindowPath('/c/minikube/deployments');
    renderShortcuts(
      '/c/minikube/deployments',
      makeStore(['production'], { NAVIGATE_TO_PODS: 'alt+shift+x' })
    );

    fireEvent.keyDown(document.body, PODS_COMBO);
    expect(locPathname()).toBe('/c/minikube/deployments');
    expect(histLength()).toBe(1);

    fireEvent.keyDown(document.body, { key: 'x', code: 'KeyX', altKey: true, shiftKey: true });
    expect(locPathname()).toBe('/c/minikube/pods');
    expect(locSearch()).toBe('?namespace=production');
  });
});
