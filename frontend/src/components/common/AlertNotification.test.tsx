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
import { useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import { PureAlertNotification } from './AlertNotification';

vi.mock('../../lib/cluster', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/cluster')>()),
  getCluster: () => 'test-cluster',
}));

const BANNER_TEXT = 'Lost connection to the cluster.';

type TestHistory = ReturnType<typeof useHistory>;

// Hands the router history to the test so it can navigate between routes
// while the component stays mounted, like the app-level instance does.
function HistoryGrabber({ onReady }: { onReady: (history: TestHistory) => void }) {
  const history = useHistory();
  useEffect(() => {
    onReady(history);
  }, [history, onReady]);
  return null;
}

describe('PureAlertNotification', () => {
  // The suite-wide config fakes Date + setTimeout/clearTimeout; opt setInterval/clearInterval
  // (the health-check poller) in as well for these timing assertions.
  beforeEach(() =>
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    })
  );
  // Unmount before restoring real timers so the effect's clearInterval runs
  // against the same fake implementation that created the interval.
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // A failed check backs the poll interval off from 5s to 10s. Once a check
  // succeeds the interval must return to 5s; otherwise it stays elevated for
  // the rest of the session and the banner lingers after recovery (issue #6445).
  it('resets the poll interval back to the base cadence after a recovery', async () => {
    // First check fails (→ next interval 10s), the rest succeed.
    const checkerFunction = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue({});

    await act(async () => {
      render(
        <TestContext>
          <PureAlertNotification checkerFunction={checkerFunction} />
        </TestContext>
      );
    });

    // t=5s: first tick fails, backoff bumps the next interval to 10s.
    await act(async () => await vi.advanceTimersByTimeAsync(5000));
    expect(checkerFunction).toHaveBeenCalledTimes(1);

    // t=15s: second tick (10s later) succeeds and should reset the backoff to 5s.
    await act(async () => await vi.advanceTimersByTimeAsync(10000));
    expect(checkerFunction).toHaveBeenCalledTimes(2);

    // t=20s: with the reset, the next tick fires 5s later. Without the reset the
    // interval would still be 10s and this advance would see no new call.
    await act(async () => await vi.advanceTimersByTimeAsync(5000));
    expect(checkerFunction).toHaveBeenCalledTimes(3);
  });

  // Routes in ROUTES_WITHOUT_ALERT hide the alert, so polling there only
  // accrues expected failures. That stale error and backoff used to render
  // as a "lost connection" banner right after OIDC sign-in.
  it('does not poll cluster health on routes that hide the alert', async () => {
    const checkerFunction = vi.fn().mockRejectedValue(new Error('no session'));

    await act(async () => {
      render(
        <TestContext urlPrefix="/c/test-cluster/login">
          <PureAlertNotification checkerFunction={checkerFunction} />
        </TestContext>
      );
    });

    await act(async () => await vi.advanceTimersByTimeAsync(20000));
    expect(checkerFunction).not.toHaveBeenCalled();
  });

  // A failed check on a cluster view must not survive a pass through a hidden
  // route. Before the fix the error and the raised backoff stayed in state, so
  // the banner came back at once when the user returned from the login page,
  // and the next check ran on the raised cadence.
  it('clears stale error and backoff after a pass through a hidden route', async () => {
    const checkerFunction = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue({});
    let testHistory!: TestHistory;

    await act(async () => {
      render(
        <TestContext urlPrefix="/c/test-cluster">
          <HistoryGrabber
            onReady={history => {
              testHistory = history;
            }}
          />
          <PureAlertNotification checkerFunction={checkerFunction} />
        </TestContext>
      );
    });

    // t=5s: the check fails on the cluster view and the banner shows.
    await act(async () => await vi.advanceTimersByTimeAsync(5000));
    expect(checkerFunction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(BANNER_TEXT)).not.toBeNull();

    // On the login route the banner hides and polling stops.
    await act(async () => {
      testHistory.push('/c/test-cluster/login');
    });
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
    await act(async () => await vi.advanceTimersByTimeAsync(20000));
    expect(checkerFunction).toHaveBeenCalledTimes(1);

    // Back on the cluster view no stale banner appears before any new check.
    await act(async () => {
      testHistory.push('/c/test-cluster');
    });
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();

    // The next check runs 5s later on the base cadence and succeeds.
    await act(async () => await vi.advanceTimersByTimeAsync(5000));
    expect(checkerFunction).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
  });

  // clearInterval stops future ticks only. A check that is in flight when the
  // route hides the alert settles later. When it settles after the user is
  // back on a cluster view, its rejection belongs to the old poller epoch and
  // must not write a banner or a backoff into the new one.
  it('ignores a check that settles after a pass through a hidden route', async () => {
    const pendingRejects: Array<(reason: Error) => void> = [];
    const checkerFunction = vi.fn(
      () =>
        new Promise((_resolve, reject) => {
          pendingRejects.push(reject);
        })
    );
    let testHistory!: TestHistory;

    await act(async () => {
      render(
        <TestContext urlPrefix="/c/test-cluster">
          <HistoryGrabber
            onReady={history => {
              testHistory = history;
            }}
          />
          <PureAlertNotification checkerFunction={checkerFunction} />
        </TestContext>
      );
    });

    // t=5s: a check starts and stays in flight.
    await act(async () => await vi.advanceTimersByTimeAsync(5000));
    expect(checkerFunction).toHaveBeenCalledTimes(1);

    // A quick pass through the login route and back while the check is
    // still pending.
    await act(async () => {
      testHistory.push('/c/test-cluster/login');
    });
    await act(async () => {
      testHistory.push('/c/test-cluster');
    });

    // The old check settles now. It must leave no banner behind.
    await act(async () => {
      pendingRejects[0](new Error('late rejection'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();

    // The backoff stayed at the base cadence: the next check fires 5s later.
    await act(async () => await vi.advanceTimersByTimeAsync(5000));
    expect(checkerFunction).toHaveBeenCalledTimes(2);
  });
});
