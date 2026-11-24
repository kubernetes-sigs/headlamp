/*
 * Copyright 2026 The Kubernetes Authors
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

import { waitFor } from '@testing-library/react';
import {
  createBrowserHistory,
  createHashHistory,
  createLocation,
  createMemoryHistory,
} from 'history';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { resetClusterPreOpenHooksForTests } from '../../plugin/clusterPreOpen';
import { getSelectedClusters } from '../cluster';
import { createClusterHistory } from './clusterHistory';

let previousUrl: string;

beforeEach(() => {
  previousUrl = window.location.pathname + window.location.search + window.location.hash;
  resetClusterPreOpenHooksForTests();
});

afterEach(() => {
  window.history.replaceState({}, '', previousUrl);
});

it.each([
  ['push', '/c/50%25off/pods', '50%off'],
  ['replace', '/c/50%25off/pods', '50%off'],
  ['push', '/c/%2541/pods', '%41'],
  ['replace', '/c/%2541/pods', '%41'],
] as const)('decodes %s navigation to %s exactly once', (method, path, cluster) => {
  const underlying = createMemoryHistory({ initialEntries: ['/c/current/pods'] });
  const navigation = createClusterHistory(underlying);
  const cleanup = navigation.start();
  try {
    navigation.history[method](path);
    navigation.commit(navigation.getPending()!);
    expect(navigation.history.location.pathname).toBe(`/c/${cluster}/pods`);
    expect(navigation.history.createHref(navigation.history.location)).toBe(path);
    expect(getSelectedClusters()).toEqual([cluster]);
  } finally {
    cleanup();
  }
});

it.each(['browser', 'hash'] as const)(
  'preserves encoded cluster names in the actual %s URL through reload and POP',
  async mode => {
    const basename = '/base';
    const makeHistory = () =>
      mode === 'browser' ? createBrowserHistory({ basename }) : createHashHistory({ basename });
    const domUrl = () =>
      mode === 'browser'
        ? window.location.pathname + window.location.search + window.location.hash
        : window.location.hash.slice(1);
    window.history.replaceState(
      {},
      '',
      mode === 'browser' ? `${basename}/c/current/pods` : `/#${basename}/c/current/pods`
    );
    const navigation = createClusterHistory(makeHistory());
    const cleanup = navigation.start();
    try {
      for (const method of ['push', 'replace'] as const) {
        for (const [path, cluster] of [
          ['/c/%2541/pods', '%41'],
          ['/c/50%25off/pods', '50%off'],
        ]) {
          navigation.history[method](`${path}?label=app#details`);
          navigation.commit(navigation.getPending()!);
          const expectedUrl = `${basename}${path}?label=app#details`;
          expect(domUrl()).toBe(expectedUrl);
          expect(getSelectedClusters()).toEqual([cluster]);
          expect(navigation.history.createHref(navigation.history.location)).toBe(
            `${mode === 'hash' ? '#' : ''}${expectedUrl}`
          );
          const reloaded = createClusterHistory(makeHistory());
          expect(getSelectedClusters([], reloaded.history.location.pathname)).toEqual([cluster]);

          navigation.history.push('/settings');
          navigation.history.goBack();
          await waitFor(() => expect(navigation.getPending()).not.toBeNull());
          expect(getSelectedClusters()).toEqual([]);
          expect(domUrl()).toBe(expectedUrl);
          navigation.commit(navigation.getPending()!);
          expect(getSelectedClusters()).toEqual([cluster]);
          navigation.history.goForward();
          await waitFor(() => expect(navigation.history.location.pathname).toBe('/settings'));
          expect(getSelectedClusters()).toEqual([]);
        }
      }
    } finally {
      cleanup();
    }
  }
);

it.each(['push', 'replace'] as const)('does not decode full locations again on %s', method => {
  const navigation = createClusterHistory(createMemoryHistory({ initialEntries: ['/'] }));
  const cleanup = navigation.start();
  try {
    const next = createLocation('/c/%2541/pods?label=app#details', { from: 'link' });
    expect(navigation.history.createHref(next)).toBe('/c/%2541/pods?label=app#details');
    navigation.history[method](next);
    navigation.commit(navigation.getPending()!);
    expect(getSelectedClusters()).toEqual(['%41']);
    expect(navigation.history.location.state).toEqual({ from: 'link' });
  } finally {
    cleanup();
  }
});

it('does not cancel another pending target when an encoded hash write emits hashchange', async () => {
  window.history.replaceState({}, '', '/#/c/current/pods');
  const navigation = createClusterHistory(createHashHistory());
  const cleanup = navigation.start();
  try {
    const changed = new Promise<void>(resolve =>
      window.addEventListener('hashchange', () => resolve(), { once: true })
    );
    navigation.history.push(createLocation('/c/%2541/pods', null));
    navigation.commit(navigation.getPending()!);
    navigation.history.push('/c/next/pods');
    const pending = navigation.getPending();
    await changed;
    expect(navigation.getPending()).toBe(pending);
    expect(getSelectedClusters()).toEqual(['%41']);
  } finally {
    cleanup();
  }
});

it('cancels an unprepared hash POP when a second POP returns to the committed URL', async () => {
  window.history.replaceState({}, '', '/#/c/current/pods');
  const navigation = createClusterHistory(createHashHistory());
  const cleanup = navigation.start();
  try {
    navigation.history.push('/c/%2541/pods');
    navigation.commit(navigation.getPending()!);
    navigation.history.push('/c/current/pods');
    navigation.commit(navigation.getPending()!);
    navigation.history.goBack();
    await waitFor(() => expect(navigation.getPending()).not.toBeNull());
    expect(getSelectedClusters()).toEqual(['current']);
    navigation.history.goBack();
    await waitFor(() => expect(navigation.getPending()).toBeNull());
    expect(window.location.hash).toBe('#/c/current/pods');
    expect(getSelectedClusters()).toEqual(['current']);
  } finally {
    cleanup();
  }
});
