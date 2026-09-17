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

/**
 * Regression tests for the route-change activity policy in ActivitiesRenderer.
 *
 * Policy (see ActivitiesRenderer useEffect ~line 997):
 *   - Route change → non-split-right activities are minimized.
 *   - Route change → split-right activities are intentionally preserved.
 *
 * A failure in the second test means a sidebar click (or any navigation) will
 * silently close the detail panels the user wanted to keep visible alongside
 * the new view. The PR that introduced minimizeAll() triggered exactly this.
 */

import { act, cleanup, render } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import React from 'react';
import { Provider } from 'react-redux';
import { Route, Router } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import store from '../../redux/stores/store';
import { ActivitiesRenderer } from './Activity';
import { activitySlice } from './activitySlice';

vi.mock('./ActivityTaskbar', () => ({ default: () => null }));
vi.mock('./ActivityPanel', () => ({ default: () => null }));

beforeEach(() => {
  // launchActivity forces location:'full' on narrow windows; use a wide viewport
  // so split-right activities keep their location in the test store.
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
});

afterEach(() => {
  cleanup();
  store.dispatch(activitySlice.actions.reset());
});

function setup(initialPath = '/pods') {
  const history = createMemoryHistory({ initialEntries: [initialPath] });
  render(
    <Provider store={store}>
      <Router history={history}>
        <Route path="*">
          <ActivitiesRenderer />
        </Route>
      </Router>
    </Provider>
  );
  return history;
}

describe('ActivitiesRenderer — route-change activity policy', () => {
  it('minimizes a non-split-right activity when the route changes', async () => {
    store.dispatch(
      activitySlice.actions.launchActivity({
        id: 'log-1',
        content: null,
        location: 'full',
      })
    );

    const history = setup();
    await act(async () => {
      history.push('/deployments');
    });

    expect(store.getState().activity.activities['log-1'].minimized).toBe(true);
  });

  it('preserves a split-right activity when the route changes', async () => {
    // This is the policy that minimizeAll() violated: split-right panels
    // stay open so users can see the new route alongside the detail view.
    store.dispatch(
      activitySlice.actions.launchActivity({
        id: 'detail-1',
        content: null,
        location: 'split-right',
      })
    );

    const history = setup();
    await act(async () => {
      history.push('/deployments');
    });

    expect(store.getState().activity.activities['detail-1']).toBeDefined();
    expect(store.getState().activity.activities['detail-1'].minimized).toBeFalsy();
  });
});
