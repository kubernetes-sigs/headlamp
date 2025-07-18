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

import nock from 'nock';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { findKubeconfigByClusterName, getUserIdFromLocalStorage } from '../../../../stateless';
import { getClusterAuthType } from '../v1/clusterRequests';
import { BASE_HTTP_URL, clusterFetch } from './fetch';

vi.mock('../../../auth', () => ({
  getToken: vi.fn(),
  setToken: vi.fn(),
}));

vi.mock('../../../../stateless', () => ({
  findKubeconfigByClusterName: vi.fn(),
  getUserIdFromLocalStorage: vi.fn(),
}));

vi.mock('../v1/clusterRequests', () => ({
  getClusterAuthType: vi.fn(),
}));

vi.mock('../v1/tokenApi', () => ({
  refreshToken: vi.fn(),
}));

describe('clusterFetch', () => {
  const clusterName = 'test-cluster';
  const testUrl = '/test/url';
  const mockResponse = { message: 'mock response' };
  const kubeconfig = 'mock-kubeconfig';
  const userID = 'mock-user-id';

  beforeEach(() => {
    vi.resetAllMocks();
    (findKubeconfigByClusterName as Mock).mockResolvedValue(kubeconfig);
    (getUserIdFromLocalStorage as Mock).mockReturnValue(userID);
    (getClusterAuthType as Mock).mockReturnValue('serviceAccount');
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('Successfully makes a request', async () => {
    nock(BASE_HTTP_URL).get(`/clusters/${clusterName}${testUrl}`).reply(200, mockResponse);

    const response = await clusterFetch(testUrl, { cluster: clusterName });
    const responseBody = await response.json();

    expect(responseBody).toEqual(mockResponse);
  });

  it('Sets KUBECONFIG and X-HEADLAMP-USER-ID headers if kubeconfig exists', async () => {
    nock(BASE_HTTP_URL)
      .get(`/clusters/${clusterName}${testUrl}`)
      .matchHeader('KUBECONFIG', kubeconfig)
      .matchHeader('X-HEADLAMP-USER-ID', userID)
      .reply(200, mockResponse);

    await clusterFetch(testUrl, { cluster: clusterName });
  });

  it('Throws an error if response is not ok', async () => {
    nock(BASE_HTTP_URL).get(`/clusters/${clusterName}${testUrl}`).reply(500);

    await expect(clusterFetch(testUrl, { cluster: clusterName })).rejects.toThrow('Unreachable');
  });
});
