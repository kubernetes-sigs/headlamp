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
import { apply } from '../../lib/k8s/api/v1/apply';
import { clusterRequest } from '../../lib/k8s/api/v1/clusterRequests';
import { stream } from '../../lib/k8s/api/v1/streamingApi';
import {
  createNodeShellJob,
  createNodeShellSession,
  NODE_SHELL_JOB_ACTIVE_DEADLINE_SECONDS,
  NODE_SHELL_JOB_TTL_SECONDS,
} from './nodeShellSession';

vi.mock('../../lib/k8s/api/v1/apply', () => ({ apply: vi.fn() }));
vi.mock('../../lib/k8s/api/v1/clusterRequests', () => ({ clusterRequest: vi.fn() }));
vi.mock('../../lib/k8s/api/v1/streamingApi', () => ({ stream: vi.fn() }));

const mockApply = vi.mocked(apply);
const mockClusterRequest = vi.mocked(clusterRequest);
const mockStream = vi.mocked(stream);
const streamHandle = { cancel: vi.fn(), getSocket: vi.fn() };

describe('node shell session', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockApply.mockReset();
    mockClusterRequest.mockReset();
    mockStream.mockReset();
    mockApply.mockImplementation(async job => job as any);
    mockClusterRequest.mockResolvedValue({
      items: [
        {
          metadata: { name: 'node-debugger-worker-01-pod' },
          status: {
            phase: 'Running',
            containerStatuses: [{ name: 'debugger', state: { running: {} } }],
          },
        },
      ],
    });
    mockStream.mockReturnValue(streamHandle as any);
  });

  it('configures a host-debugger Job with bounded runtime and finished-job TTL', () => {
    const job = createNodeShellJob(
      'node-debugger-worker-01-abcde',
      'headlamp',
      'worker-01',
      'debug:latest'
    );

    expect(job.kind).toBe('Job');
    expect(job.metadata.namespace).toBe('headlamp');
    expect(job.spec.activeDeadlineSeconds).toBe(NODE_SHELL_JOB_ACTIVE_DEADLINE_SECONDS);
    expect(job.spec.ttlSecondsAfterFinished).toBe(NODE_SHELL_JOB_TTL_SECONDS);
    expect(job.spec.backoffLimit).toBe(0);
    expect(job.spec.template.spec).toMatchObject({
      nodeName: 'worker-01',
      hostPID: true,
      hostIPC: true,
      hostNetwork: true,
      restartPolicy: 'Never',
      volumes: [{ name: 'host-root', hostPath: { path: '/', type: 'Directory' } }],
    });
  });

  it('creates the Job, attaches to its running Pod, and deletes the Job during cleanup', async () => {
    const onConnectionFailure = vi.fn();
    const onCleanupError = vi.fn();
    const onData = vi.fn();
    const session = await createNodeShellSession(
      'worker-01',
      'prod',
      'headlamp',
      'debug:latest',
      onData,
      onConnectionFailure,
      onCleanupError
    );
    const job = mockApply.mock.calls[0][0] as any;

    expect(mockClusterRequest).toHaveBeenCalledWith(
      '/api/v1/namespaces/headlamp/pods',
      { method: 'GET', cluster: 'prod' },
      { labelSelector: `headlamp.dev/node-shell-job=${job.metadata.name}` }
    );
    expect(mockStream).toHaveBeenCalledWith(
      '/api/v1/namespaces/headlamp/pods/node-debugger-worker-01-pod/attach?container=debugger&stdin=1&stderr=1&stdout=1&tty=1',
      onData,
      expect.objectContaining({ cluster: 'prod', reconnectOnFailure: false })
    );

    await session.cleanup();
    await session.cleanup();

    expect(mockClusterRequest).toHaveBeenCalledWith(
      `/apis/batch/v1/namespaces/headlamp/jobs/${job.metadata.name}?propagationPolicy=Background`,
      { method: 'DELETE', cluster: 'prod' }
    );
    expect(
      mockClusterRequest.mock.calls.filter(([, options]) => options?.method === 'DELETE')
    ).toHaveLength(1);
    expect(onConnectionFailure).not.toHaveBeenCalled();
    expect(onCleanupError).not.toHaveBeenCalled();
  });

  it('deletes the Job and reports a failed attach stream', async () => {
    const onConnectionFailure = vi.fn();
    const onCleanupError = vi.fn();
    await createNodeShellSession(
      'worker-01',
      'prod',
      'headlamp',
      'debug:latest',
      vi.fn(),
      onConnectionFailure,
      onCleanupError
    );

    const streamOptions = mockStream.mock.calls[0][2];
    streamOptions.failCb?.();
    await vi.waitFor(() =>
      expect(
        mockClusterRequest.mock.calls.filter(([, options]) => options?.method === 'DELETE')
      ).toHaveLength(1)
    );

    expect(onConnectionFailure).toHaveBeenCalledTimes(1);
    expect(onCleanupError).not.toHaveBeenCalled();
  });

  it('reports a Job deletion error after an attach failure', async () => {
    const onCleanupError = vi.fn();
    await createNodeShellSession(
      'worker-01',
      'prod',
      'headlamp',
      'debug:latest',
      vi.fn(),
      vi.fn(),
      onCleanupError
    );
    mockClusterRequest.mockImplementation(async (_path, options) => {
      if (options?.method === 'DELETE') {
        throw new Error('Forbidden');
      }
      return { items: [] };
    });

    mockStream.mock.calls[0][2].failCb?.();
    await vi.waitFor(() =>
      expect(onCleanupError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Forbidden' }))
    );
  });

  it('treats an already-removed Job as cleaned up', async () => {
    const onCleanupError = vi.fn();
    const session = await createNodeShellSession(
      'worker-01',
      'prod',
      'headlamp',
      'debug:latest',
      vi.fn(),
      vi.fn(),
      onCleanupError
    );
    mockClusterRequest.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));

    await expect(session.cleanup()).resolves.toBeUndefined();

    expect(onCleanupError).not.toHaveBeenCalled();
  });

  it('deletes the Job when Pod discovery fails', async () => {
    mockClusterRequest.mockImplementation(async (_path, options) => {
      if (options?.method === 'DELETE') {
        return {};
      }
      throw new Error('Forbidden');
    });

    await expect(
      createNodeShellSession(
        'worker-01',
        'prod',
        'headlamp',
        'debug:latest',
        vi.fn(),
        vi.fn(),
        vi.fn()
      )
    ).rejects.toThrow('Forbidden');

    expect(
      mockClusterRequest.mock.calls.filter(([, options]) => options?.method === 'DELETE')
    ).toHaveLength(1);
  });
});
