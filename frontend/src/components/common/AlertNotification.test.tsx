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

import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, useHistory } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import store from '../../redux/stores/store';
import { PureAlertNotification } from './AlertNotification';

vi.mock('../../lib/cluster', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/cluster')>()),
  getCluster: () => 'test-cluster',
}));

const CLUSTER_PATH = '/c/test-cluster/pods';
const OTHER_CLUSTER_PATH = '/c/test-cluster/services';
const LOGIN_PATH = '/c/test-cluster/login';

function Navigator({ to }: { to: string }) {
  const history = useHistory();
  return (
    <button type="button" onClick={() => history.push(to)}>
      {`navigate to ${to}`}
    </button>
  );
}

function renderNotification(
  checkerFunction: () => Promise<any>,
  path = CLUSTER_PATH,
  to: string | string[] = []
) {
  // One button per destination, so a test can walk a route and come back.
  const destinations = (Array.isArray(to) ? to : [to]).filter(Boolean);
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        {destinations.map(destination => (
          <Navigator key={destination} to={destination} />
        ))}
        <PureAlertNotification checkerFunction={checkerFunction} />
      </MemoryRouter>
    </Provider>
  );
}

function navigateTo(user: ReturnType<typeof userEvent.setup>, to: string) {
  return user.click(screen.getByRole('button', { name: `navigate to ${to}` }));
}

function banner() {
  return screen.queryByText('Lost connection to the cluster.');
}

describe('PureAlertNotification', () => {
  // The suite-wide config fakes Date + setTimeout/clearTimeout, which is all the
  // health-check poller uses; Date is faked here too so the assertions on the
  // scheduled delays stay deterministic.
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }));
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('checks the cluster health as soon as it is mounted', async () => {
    const checkerFunction = vi.fn().mockResolvedValue({});

    await act(async () => {
      renderNotification(checkerFunction);
    });

    expect(checkerFunction).toHaveBeenCalledTimes(1);
    expect(banner()).not.toBeInTheDocument();
  });

  it('shows the banner once a check fails and hides it again on recovery', async () => {
    const checkerFunction = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue({});

    await act(async () => {
      renderNotification(checkerFunction);
    });
    expect(banner()).toBeInTheDocument();

    // The failure backs the next check off from 5s to 10s.
    await act(async () => await vi.advanceTimersByTimeAsync(10000));
    expect(checkerFunction).toHaveBeenCalledTimes(2);
    expect(banner()).not.toBeInTheDocument();

    // The recovery resets the backoff, so the following check is 5s later.
    await act(async () => await vi.advanceTimersByTimeAsync(5000));
    expect(checkerFunction).toHaveBeenCalledTimes(3);
  });

  it('does not check the cluster health on the auth routes', async () => {
    const checkerFunction = vi.fn().mockRejectedValue(new Error('down'));

    await act(async () => {
      renderNotification(checkerFunction, LOGIN_PATH);
    });
    await act(async () => await vi.advanceTimersByTimeAsync(60000));

    expect(checkerFunction).not.toHaveBeenCalled();
    expect(banner()).not.toBeInTheDocument();
  });

  // The banner used to keep the failure collected while the user was being
  // authenticated, and only cleared it whenever the backed off poller ran again.
  it('drops a pending failure and re-checks when moving to an auth route and back', async () => {
    const checkerFunction = vi.fn().mockRejectedValue(new Error('down'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await act(async () => {
      renderNotification(checkerFunction, CLUSTER_PATH, [LOGIN_PATH, CLUSTER_PATH]);
    });
    expect(checkerFunction).toHaveBeenCalledTimes(1);
    expect(banner()).toBeInTheDocument();

    await act(async () => await navigateTo(user, LOGIN_PATH));
    expect(banner()).not.toBeInTheDocument();
    expect(checkerFunction).toHaveBeenCalledTimes(1);

    checkerFunction.mockResolvedValue({});
    await act(async () => await navigateTo(user, CLUSTER_PATH));

    // Coming back has to re-check instead of restoring the failure it left behind.
    expect(checkerFunction).toHaveBeenCalledTimes(2);
    expect(banner()).not.toBeInTheDocument();
  });

  // showOnRoute stays true across these, so only the pathname tells the poller to rerun.
  it('re-checks when moving between two ordinary cluster routes', async () => {
    const checkerFunction = vi.fn().mockResolvedValue({});
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await act(async () => {
      renderNotification(checkerFunction, CLUSTER_PATH, OTHER_CLUSTER_PATH);
    });
    expect(checkerFunction).toHaveBeenCalledTimes(1);

    await act(async () => await navigateTo(user, OTHER_CLUSTER_PATH));

    expect(checkerFunction).toHaveBeenCalledTimes(2);
  });

  // The token can still be missing on the first check after the login redirect.
  it('stays hidden when the check right after the login redirect is still unauthorized', async () => {
    const checkerFunction = vi
      .fn()
      .mockRejectedValue(
        new ApiError('Cluster main is not healthy: Unauthorized', { status: 401 })
      );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await act(async () => {
      renderNotification(checkerFunction, LOGIN_PATH, CLUSTER_PATH);
    });
    expect(checkerFunction).not.toHaveBeenCalled();

    await act(async () => await navigateTo(user, CLUSTER_PATH));
    expect(checkerFunction).toHaveBeenCalledTimes(1);
    expect(banner()).not.toBeInTheDocument();

    checkerFunction.mockResolvedValue({});
    await act(async () => await vi.advanceTimersByTimeAsync(5000));

    expect(checkerFunction).toHaveBeenCalledTimes(2);
    expect(banner()).not.toBeInTheDocument();
  });

  it.each([401, 403])('does not show the banner for a %s response', async status => {
    const checkerFunction = vi
      .fn()
      .mockRejectedValue(new ApiError('Cluster test-cluster is not healthy', { status }));

    await act(async () => {
      renderNotification(checkerFunction);
    });
    expect(banner()).not.toBeInTheDocument();

    // Auth errors must not back the poller off either, so the next check is 5s later.
    await act(async () => await vi.advanceTimersByTimeAsync(5000));
    expect(checkerFunction).toHaveBeenCalledTimes(2);
    expect(banner()).not.toBeInTheDocument();
  });

  it('caps the backoff so a recovery is never more than 35s away', async () => {
    const checkerFunction = vi.fn().mockRejectedValue(new Error('down'));

    await act(async () => {
      renderNotification(checkerFunction);
    });

    // Delays grow by 5s per failure: 10s, 15s, … until the 35s ceiling.
    for (const delay of [10000, 15000, 20000, 25000, 30000, 35000]) {
      await act(async () => await vi.advanceTimersByTimeAsync(delay));
    }
    expect(checkerFunction).toHaveBeenCalledTimes(7);

    await act(async () => await vi.advanceTimersByTimeAsync(35000));
    expect(checkerFunction).toHaveBeenCalledTimes(8);

    await act(async () => await vi.advanceTimersByTimeAsync(35000));
    expect(checkerFunction).toHaveBeenCalledTimes(9);
  });

  it('queues a retry behind the check that is still in flight', async () => {
    let settleFirstCheck: () => void = () => {};
    const checkerFunction = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            settleFirstCheck = () => resolve();
          })
      )
      .mockResolvedValue({});

    await act(async () => {
      renderNotification(checkerFunction);
    });
    expect(checkerFunction).toHaveBeenCalledTimes(1);

    // Each of these restarts the effect while the first request is still open.
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('online'));
    });
    expect(checkerFunction).toHaveBeenCalledTimes(1);

    await act(async () => {
      settleFirstCheck();
    });

    // The queued retries collapse into the single check that follows the first one.
    expect(checkerFunction).toHaveBeenCalledTimes(2);
  });

  it('does not start a check while the previous one is still pending', async () => {
    const checkerFunction = vi.fn().mockReturnValue(new Promise(() => {}));

    await act(async () => {
      renderNotification(checkerFunction);
    });
    await act(async () => await vi.advanceTimersByTimeAsync(60000));

    expect(checkerFunction).toHaveBeenCalledTimes(1);
  });
});
