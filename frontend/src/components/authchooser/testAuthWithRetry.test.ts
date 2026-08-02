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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testAuth } from '../../lib/k8s/api/v1/clusterApi';
import type { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { testAuthWithRetry } from './testAuthWithRetry';

vi.mock('../../lib/k8s/api/v1/clusterApi', () => ({
  testAuth: vi.fn(),
}));

const testAuthMock = vi.mocked(testAuth);

function apiError(status?: number) {
  const err = new Error(`failed with ${status}`) as ApiError;
  err.status = status;
  return err;
}

describe('testAuthWithRetry', () => {
  beforeEach(() => {
    testAuthMock.mockReset();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not retry when the first attempt succeeds', async () => {
    testAuthMock.mockResolvedValueOnce({});

    await expect(testAuthWithRetry('my-cluster')).resolves.toEqual({});
    expect(testAuthMock).toHaveBeenCalledTimes(1);
  });

  // A request that never reached the cluster says nothing about whether a token is
  // needed, so it gets one more attempt before the session is interrupted.
  it.each([408, 502, 504])('retries once after a transient %i', async status => {
    testAuthMock.mockRejectedValueOnce(apiError(status)).mockResolvedValueOnce({});

    await expect(testAuthWithRetry('my-cluster')).resolves.toEqual({});
    expect(testAuthMock).toHaveBeenCalledTimes(2);
  });

  // The retry gets a shorter budget so a hanging cluster still reports promptly.
  it('retries with a shorter timeout than the first attempt', async () => {
    testAuthMock.mockRejectedValueOnce(apiError(408)).mockResolvedValueOnce({});

    await testAuthWithRetry('my-cluster');

    const firstTimeout = testAuthMock.mock.calls[0][2];
    const retryTimeout = testAuthMock.mock.calls[1][2];

    expect(retryTimeout).toBeLessThan(firstTimeout ?? 5 * 1000);
  });

  it('rejects when the retry also fails', async () => {
    testAuthMock.mockRejectedValueOnce(apiError(408)).mockRejectedValueOnce(apiError(408));

    await expect(testAuthWithRetry('my-cluster')).rejects.toMatchObject({ status: 408 });
    expect(testAuthMock).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403])('does not retry a genuine %i auth failure', async status => {
    testAuthMock.mockRejectedValueOnce(apiError(status));

    await expect(testAuthWithRetry('my-cluster')).rejects.toMatchObject({ status });
    expect(testAuthMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry an error carrying no status', async () => {
    testAuthMock.mockRejectedValueOnce(apiError(undefined));

    await expect(testAuthWithRetry('my-cluster')).rejects.toBeInstanceOf(Error);
    expect(testAuthMock).toHaveBeenCalledTimes(1);
  });
});
