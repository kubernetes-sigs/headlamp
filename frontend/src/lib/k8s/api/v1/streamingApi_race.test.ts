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
import * as findKubeconfig from '../../../../stateless/findKubeconfigByClusterName';
import * as clusterRequests from './clusterRequests';
import * as streamingApi from './streamingApi';

vi.mock('../../../../stateless/findKubeconfigByClusterName', () => ({
  findKubeconfigByClusterName: vi.fn(),
}));

vi.mock('../../../../helpers/getAppUrl', () => ({
  getAppUrl: vi.fn(() => 'http://localhost:4466'),
}));

vi.mock('./clusterRequests', () => ({
  clusterRequest: vi.fn(),
}));

describe('streamingApi race conditions', () => {
  let mockWebSocket: any;

  beforeEach(() => {
    mockWebSocket = {
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      send: vi.fn(),
    };
    vi.stubGlobal(
      'WebSocket',
      vi.fn(() => mockWebSocket)
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('stream() should close connection if cancelled during async connectStream setup', async () => {
    // Mock findKubeconfigByClusterName to resolve after a delay
    let resolveKubeconfig: (val: any) => void;
    const kubeconfigPromise = new Promise(resolve => {
      resolveKubeconfig = resolve;
    });
    (findKubeconfig.findKubeconfigByClusterName as any).mockReturnValue(kubeconfigPromise);

    const { cancel } = streamingApi.stream('/test', vi.fn(), { cluster: 'test-cluster' });

    // Cancel while setup is pending
    cancel();

    // Now resolve setup
    resolveKubeconfig!(null);

    // Wait for async setup to finish
    await new Promise(resolve => setTimeout(resolve, 50));

    // The socket should have been created and then immediately closed
    expect(global.WebSocket).toHaveBeenCalled();
    expect(mockWebSocket.close).toHaveBeenCalled();
  });

  it('streamResult should not leak socket if cancelled during initial clusterRequest', async () => {
    // Mock clusterRequest to resolve after a delay
    let resolveRequest: (val: any) => void;
    const requestPromise = new Promise(resolve => {
      resolveRequest = resolve;
    });
    (clusterRequests.clusterRequest as any).mockReturnValue(requestPromise);

    const cancelPromise = streamingApi.streamResult('/test', 'name', vi.fn(), vi.fn());
    const cancel = await cancelPromise;

    // Cancel while clusterRequest is pending
    cancel();

    // Now resolve clusterRequest
    resolveRequest!({ metadata: { name: 'name' } });

    // Wait for async run()
    await new Promise(resolve => setTimeout(resolve, 50));

    // stream() should NEVER have been called, so WebSocket should not have been created
    expect(global.WebSocket).not.toHaveBeenCalled();
  });

  it('streamResultsForCluster should not leak socket if cancelled during initial clusterRequest', async () => {
    // Mock clusterRequest to resolve after a delay
    let resolveRequest: (val: any) => void;
    const requestPromise = new Promise(resolve => {
      resolveRequest = resolve;
    });
    (clusterRequests.clusterRequest as any).mockReturnValue(requestPromise);

    const cancelPromise = streamingApi.streamResultsForCluster('/test', {
      cb: vi.fn(),
      errCb: vi.fn(),
    });
    const cancel = await cancelPromise;

    // Cancel while clusterRequest is pending
    cancel();

    // Now resolve clusterRequest
    resolveRequest!({ kind: 'PodList', items: [], metadata: { resourceVersion: '1' } });

    // Wait for async run()
    await new Promise(resolve => setTimeout(resolve, 50));

    // stream() should NEVER have been called, so WebSocket should not have been created
    expect(global.WebSocket).not.toHaveBeenCalled();
  });
});
