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

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import { PureAlertNotification } from './AlertNotification';

vi.mock('../../lib/cluster', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/cluster')>()),
  getCluster: () => 'test-cluster',
}));

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
});
