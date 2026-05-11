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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStream = vi.fn();
vi.mock('./api/v1/streamingApi', () => ({
  stream: (...args: any[]) => mockStream(...args),
}));

// Avoid pulling in the full `./index` barrel via KubeObject's imports.
vi.mock('./KubeObject', () => {
  class KubeObject<T = any> {
    jsonData: T;
    cluster?: string;
    constructor(jsonData: T, cluster?: string) {
      this.jsonData = jsonData;
      this.cluster = cluster;
    }
    getName() {
      return (this.jsonData as any)?.metadata?.name ?? '';
    }
    getNamespace() {
      return (this.jsonData as any)?.metadata?.namespace ?? '';
    }
  }
  return { KubeObject };
});

vi.mock('./api/v1/clusterRequests', () => ({
  post: vi.fn(),
  patch: vi.fn(),
}));

const { default: Pod } = await import('./pod');

function makePod(): Pod {
  return new Pod({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'test-pod', namespace: 'default', uid: 'pod-uid-123' },
    spec: { containers: [{ name: 'nginx' }], nodeName: 'test-node' },
    status: { containerStatuses: [], phase: 'Running' },
  } as any);
}

describe('Pod.getLogs', () => {
  beforeEach(() => {
    mockStream.mockReset();
    mockStream.mockReturnValue({ cancel: () => {}, getSocket: () => null });
  });

  describe('failCb / onReconnectStop', () => {
    it('does not call onReconnectStop when showPrevious is true', () => {
      const onReconnectStop = vi.fn();
      makePod().getLogs('nginx', () => {}, { showPrevious: true, follow: true, onReconnectStop });

      const streamArgs = mockStream.mock.calls[0][2];
      streamArgs.failCb();

      expect(onReconnectStop).not.toHaveBeenCalled();
    });

    it('calls onReconnectStop when showPrevious is false', () => {
      const onReconnectStop = vi.fn();
      makePod().getLogs('nginx', () => {}, { showPrevious: false, follow: true, onReconnectStop });

      const streamArgs = mockStream.mock.calls[0][2];
      streamArgs.failCb();

      expect(onReconnectStop).toHaveBeenCalledTimes(1);
    });

    it('does not call onReconnectStop when follow is false', () => {
      const onReconnectStop = vi.fn();
      makePod().getLogs('nginx', () => {}, { showPrevious: false, follow: false, onReconnectStop });

      const streamArgs = mockStream.mock.calls[0][2];
      streamArgs.failCb();

      expect(onReconnectStop).not.toHaveBeenCalled();
    });

    it('only calls onReconnectStop once across repeated failCb invocations', () => {
      const onReconnectStop = vi.fn();
      makePod().getLogs('nginx', () => {}, { showPrevious: false, follow: true, onReconnectStop });

      const streamArgs = mockStream.mock.calls[0][2];
      streamArgs.failCb();
      streamArgs.failCb();

      expect(onReconnectStop).toHaveBeenCalledTimes(1);
    });
  });
});
