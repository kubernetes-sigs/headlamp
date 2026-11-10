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
 * Policy:
 *   - Route changes minimize activities that block the main content.
 *   - Ordinary split-right activities remain visible.
 *   - Resource-details drawers are minimized at every location but remain in the store.
 *
 * A failure in the second test means a sidebar click (or any navigation) will
 * silently close an ordinary side activity the user wanted to keep visible.
 * The PR that introduced minimizeAll() triggered exactly this.
 */

import List from '@mui/material/List';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import React from 'react';
import { Provider } from 'react-redux';
import { Route, Router } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import store from '../../redux/stores/store';
import ListItemLink from '../Sidebar/ListItemLink';
import { ActivitiesRenderer } from './Activity';
import { activitySlice } from './activitySlice';

vi.mock('./ActivityTaskbar', () => ({ default: () => null }));
vi.mock('./ActivityPanel', () => ({ default: () => null }));

const theme = createMuiTheme({ name: 'light', base: 'light' });

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
    <ThemeProvider theme={theme}>
      <Provider store={store}>
        <Router history={history}>
          <List>
            <ListItemLink
              primary="Deployments"
              pathname="/deployments"
              name="Deployments"
              fullWidth
            />
          </List>
          <Route path="*">
            <ActivitiesRenderer />
          </Route>
        </Router>
      </Provider>
    </ThemeProvider>
  );
}

describe('ActivitiesRenderer — route-change activity policy', () => {
  it('minimizes a non-split-right activity when the route changes', async () => {
    const user = userEvent.setup();
    store.dispatch(
      activitySlice.actions.launchActivity({
        id: 'log-1',
        content: null,
        location: 'full',
      })
    );

    setup();
    await user.click(screen.getByRole('button', { name: 'Deployments' }));

    expect(store.getState().activity.activities['log-1'].minimized).toBe(true);
  });

  it('preserves an ordinary split-right activity when the route changes', async () => {
    const user = userEvent.setup();
    // This is the policy that minimizeAll() violated: ordinary split-right
    // activities stay open so users can see them alongside the new route.
    store.dispatch(
      activitySlice.actions.launchActivity({
        id: 'side-activity-1',
        content: null,
        location: 'split-right',
      })
    );

    setup();
    await user.click(screen.getByRole('button', { name: 'Deployments' }));

    expect(store.getState().activity.activities['side-activity-1']).toBeDefined();
    expect(store.getState().activity.activities['side-activity-1'].minimized).toBeFalsy();
  });

  it('minimizes a temporary resource-details drawer without removing it', async () => {
    const user = userEvent.setup();
    store.dispatch(
      activitySlice.actions.launchActivity({
        id: 'resource-details-1',
        content: null,
        kind: 'details',
        location: 'split-right',
        temporary: true,
      })
    );

    setup();
    await user.click(screen.getByRole('button', { name: 'Deployments' }));

    const activity = store.getState().activity.activities['resource-details-1'];
    expect(activity).toBeDefined();
    expect(activity.minimized).toBe(true);
  });
});
