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

import { clusterRequest } from './v1/clusterRequests';
import { metrics } from './v1/metricsApi';
import { ApiError } from './v2/ApiError';
import { clusterFetch } from './v2/fetch';
import { nodeSummaryStats } from './v2/nodeSummaryApi';

vi.mock('./v1/clusterRequests', () => ({ clusterRequest: vi.fn() }));
vi.mock('./v2/fetch', () => ({ clusterFetch: vi.fn() }));

describe.each([
  { name: 'metrics', start: metrics },
  { name: 'node summary', start: nodeSummaryStats },
])('$name polling cancellation', ({ start }) => {
  const onData = vi.fn();
  const onError = vi.fn();
  let resolveRequest: (value: any) => void;
  let rejectRequest: (error: Error) => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    const pending = new Promise<any>((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });
    vi.mocked(clusterRequest).mockReturnValue(pending);
    vi.mocked(clusterFetch).mockReturnValue(pending);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('does not publish a response that arrives after cancellation', async () => {
    const cancel = await start('node-or-url', onData, onError, 'cluster-a');
    cancel();
    resolveRequest({ items: [], json: async () => ({ node: {} }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(onData).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not publish an error that arrives after cancellation', async () => {
    const cancel = await start('node-or-url', onData, onError, 'cluster-a');
    cancel();
    rejectRequest(new ApiError('old cluster unavailable', { status: 503 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).not.toHaveBeenCalled();
    expect(onData).not.toHaveBeenCalled();
  });

  it('still reports errors for an active subscription', async () => {
    const cancel = await start('node-or-url', onData, onError, 'cluster-a');
    const error = new ApiError('cluster unavailable', { status: 503 });
    rejectRequest(error);
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(error);
    expect(onData).not.toHaveBeenCalled();
    cancel();
  });

  it('publishes active results and stops scheduling requests when cancelled', async () => {
    const cancel = await start('node-or-url', onData, onError, 'cluster-a');
    resolveRequest({ items: [], json: async () => ({ node: {} }) });
    await vi.advanceTimersByTimeAsync(10000);
    expect(onData).toHaveBeenCalledTimes(2);
    cancel();
    await vi.advanceTimersByTimeAsync(30000);
    expect(onData).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });
});
