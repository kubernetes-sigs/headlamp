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
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { Provider } from 'react-redux';
import { Router } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMuiTheme } from '../../../../lib/themes';
import notificationsReducer, { Notification } from '../notificationsSlice';
import NotificationList from './List';

const theme = createMuiTheme({ base: 'light', name: 'light' });

function createTestStore(notifications: Notification[], clusters: Record<string, any> = {}) {
  return configureStore({
    reducer: {
      notifications: notificationsReducer,
      config: (state = { clusters, settings: {} }) => state,
      filter: (state = { namespaces: new Set(), search: '' }) => state,
      shortcuts: (state = { shortcuts: {} }) => state,
      ui: (
        state = {
          functionsToOverride: {},
          hideAppBar: false,
          isFullWidth: false,
        }
      ) => state,
    },
    preloadedState: {
      notifications: { notifications },
    },
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({ immutableCheck: false, serializableCheck: false }),
  });
}

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  const n = new Notification({
    message: 'Pod crashed',
    cluster: 'cluster-a',
    date: '2025-01-01T00:00:00Z',
  });
  n.url = '/c/cluster-a/pods';
  Object.assign(n, overrides);
  return n;
}

function renderList(
  notifications: Notification[],
  clusters: Record<string, any> = { 'cluster-a': { name: 'cluster-a' } },
  history = createMemoryHistory({ initialEntries: ['/notifications'] })
) {
  const store = createTestStore(notifications, clusters);
  return {
    store,
    history,
    ...render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <Router history={history}>
            <NotificationList />
          </Router>
        </ThemeProvider>
      </Provider>
    ),
  };
}

describe('NotificationList', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows empty state and disables menu actions when all notifications are deleted or empty', async () => {
    const deleted = makeNotification({ id: 'n1', deleted: true });
    renderList([deleted]);

    expect(screen.getByText("You don't have any notifications right now")).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('menuitem', { name: 'Mark all as read' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('menuitem', { name: 'Clear all' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('renders notifications, fallback message, and cluster link only when multiple clusters exist', () => {
    const n1 = makeNotification({
      id: 'n1',
      message: 'Alert 1',
      cluster: 'cluster-a',
      seen: false,
    });
    const n2 = makeNotification({ id: 'n2', message: '', cluster: 'cluster-b', seen: true });

    const { unmount } = renderList([n1, n2], { 'cluster-a': { name: 'cluster-a' } });
    expect(screen.getByText('Alert 1')).toHaveStyle({ fontWeight: 'bold' });
    expect(screen.getByText('No message')).toHaveStyle({ fontWeight: 'normal' });
    expect(screen.queryByRole('link', { name: 'cluster-a' })).not.toBeInTheDocument();
    unmount();

    renderList([n1, n2], {
      'cluster-a': { name: 'cluster-a' },
      'cluster-b': { name: 'cluster-b' },
    });
    expect(screen.getByRole('link', { name: 'cluster-a' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'cluster-b' })).toBeInTheDocument();
  });

  it('navigates and marks notification as seen when clicked, and marks single notification as read via button', async () => {
    const n1 = makeNotification({
      id: 'n1',
      message: 'Clickable notice',
      url: '/c/cluster-a/deployments',
      seen: false,
    });
    const n2 = makeNotification({
      id: 'n2',
      message: 'Unread notice',
      url: '/c/cluster-a/pods',
      seen: false,
    });

    const { store, history } = renderList([n1, n2]);

    await userEvent.click(screen.getByText('Clickable notice'));
    expect(history.location.pathname).toBe('/c/cluster-a/deployments');
    expect(store.getState().notifications.notifications.find(n => n.id === 'n1')?.seen).toBe(true);

    const markReadButtons = screen.getAllByRole('button', { name: 'Mark as read' });
    expect(markReadButtons).toHaveLength(1);
    await userEvent.click(markReadButtons[0]);
    expect(store.getState().notifications.notifications.find(n => n.id === 'n2')?.seen).toBe(true);
    expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument();
  });

  it('does not change route when clicking a notification without a URL', async () => {
    const n = makeNotification({
      id: 'n3',
      message: 'No URL notice',
      url: '',
      seen: false,
    });
    const { history } = renderList([n]);

    await userEvent.click(screen.getByText('No URL notice'));
    expect(history.location.pathname).toBe('/notifications');
  });

  it('marks all as read and clears all notifications from the menu', async () => {
    const n1 = makeNotification({ id: 'n1', message: 'Unread 1', seen: false, deleted: false });
    const n2 = makeNotification({ id: 'n2', message: 'Unread 2', seen: false, deleted: false });

    const { store } = renderList([n1, n2]);

    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark all as read' }));
    expect(store.getState().notifications.notifications.every((n: any) => n.seen)).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Clear all' }));
    expect(store.getState().notifications.notifications.every((n: any) => n.deleted)).toBe(true);
    expect(screen.getByText("You don't have any notifications right now")).toBeInTheDocument();

    // Close menu via Escape
    if (screen.queryByRole('menu')) {
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    }
  });
});
