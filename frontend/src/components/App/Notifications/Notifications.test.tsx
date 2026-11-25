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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultRoutes, setDefaultRoutes } from '../../../lib/router/getDefaultRoutes';
import { setConfig } from '../../../redux/configSlice';
import store from '../../../redux/stores/store';
import { TestContext } from '../../../test';
import Notifications from './Notifications';
import { Notification, setNotifications } from './notificationsSlice';

const mockPush = vi.fn();
let mockWarnings: Record<string, { warnings: any[] }> = {};

vi.mock('react-router', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, any>;
  return {
    ...actual,
    useHistory: () => ({ push: mockPush }),
  };
});

vi.mock('../../../lib/k8s/event', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, any>;
  return {
    ...actual,
    useEventWarningList: () => mockWarnings,
  };
});

vi.mock('react-window', () => ({
  FixedSizeList: ({ itemCount, children: Row }: any) => (
    <div data-testid="notifications-list">
      {Array.from({ length: itemCount }).map((_, index) => (
        <Row key={index} index={index} style={{}} />
      ))}
    </div>
  ),
}));

describe('Notifications', () => {
  let originalRoutes: ReturnType<typeof getDefaultRoutes>;

  beforeEach(() => {
    originalRoutes = { ...getDefaultRoutes() };
    setDefaultRoutes({
      ...originalRoutes,
      cluster: {
        path: '/',
        name: 'Cluster',
        sidebar: 'cluster',
        component: () => null,
      },
    });
    vi.clearAllMocks();
    mockWarnings = {};
    localStorage.clear();
    store.dispatch(setNotifications([]));
    store.dispatch(
      setConfig({
        clusters: {
          c1: { name: 'c1', server: 'https://c1' },
          c2: { name: 'c2', server: 'https://c2' },
        },
      } as any)
    );
  });

  afterEach(() => {
    setDefaultRoutes(originalRoutes);
  });

  it('renders empty state and disabled action buttons when there are no notifications', () => {
    render(
      <TestContext>
        <Notifications />
      </TestContext>
    );

    const bell = screen.getByRole('button', { name: 'Show notifications' });
    fireEvent.click(bell);

    expect(screen.getByText("You don't have any notifications right now")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'View all notifications' }));
    expect(mockPush).toHaveBeenCalledWith('/notifications');
  });

  it('displays unread and read notifications, marks individual/all read, navigates, and clears', () => {
    const n1 = new Notification({
      message: 'Pod crashed',
      date: Date.now(),
      cluster: 'c1',
    }).toJSON();
    n1.id = 'n1';
    n1.url = '/c/c1/pods/p1';

    const n2 = new Notification({
      message: '',
      date: Date.now() - 1000,
      cluster: 'c2',
    }).toJSON();
    n2.id = 'n2';
    n2.seen = true;

    const n3 = new Notification({
      message: 'Deleted item',
      date: Date.now() - 2000,
      cluster: 'c1',
    }).toJSON();
    n3.id = 'n3';
    n3.deleted = true;

    store.dispatch(setNotifications([n1, n2, n3]));

    render(
      <TestContext>
        <Notifications />
      </TestContext>
    );

    expect(screen.getByLabelText('You have unread notifications')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show notifications' }));

    expect(screen.getByText('Pod crashed')).toBeInTheDocument();
    expect(screen.getByText('No message')).toBeInTheDocument();
    expect(screen.queryByText('Deleted item')).not.toBeInTheDocument();
    expect(screen.getByText('c1')).toBeInTheDocument();

    // Mark single notification as read
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
    expect(store.getState().notifications.notifications[0].seen).toBe(true);

    // Click notification item with url -> navigates and closes popover
    fireEvent.click(screen.getByText('Pod crashed'));
    expect(mockPush).toHaveBeenCalledWith('/c/c1/pods/p1');

    // Re-open and clear all
    fireEvent.click(screen.getByRole('button', { name: 'Show notifications' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText("You don't have any notifications right now")).toBeInTheDocument();
  });

  it('marks all notifications as read when Mark all as read is clicked', () => {
    const n1 = new Notification({
      message: 'Warning 1',
      date: Date.now(),
      cluster: 'c1',
    }).toJSON();
    n1.id = 'w1';
    n1.seen = false;
    store.dispatch(setNotifications([n1]));

    render(
      <TestContext>
        <Notifications />
      </TestContext>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show notifications' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    expect(store.getState().notifications.notifications[0].seen).toBe(true);
  });

  it('ingests cluster warning events into notifications store', async () => {
    mockWarnings = {
      c1: {
        warnings: [
          {
            metadata: { uid: 'ev-1', creationTimestamp: '2025-01-01T00:00:00Z' },
            message: 'BackOff pulling image',
          },
        ],
      },
      c2: { warnings: [] },
    };

    render(
      <TestContext>
        <Notifications />
      </TestContext>
    );

    await waitFor(() => {
      const list = store.getState().notifications.notifications;
      expect(
        list.some(
          n =>
            n.id === 'ev-1' &&
            n.message === 'BackOff pulling image' &&
            n.url === '/c/c1/?eventsFilter=ev-1'
        )
      ).toBe(true);
    });
  });
});
