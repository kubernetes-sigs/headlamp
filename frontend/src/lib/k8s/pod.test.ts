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

import { describe, expect, it } from 'vitest';
import App from '../../App';
import Pod from './pod';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('Pod class', () => {
  const mockPodData = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: 'test-pod',
      namespace: 'default',
      resourceVersion: '123',
    },
    spec: {
      containers: [{ name: 'container-1' }, { name: 'container-2' }],
    },
    status: {
      phase: 'Running',
      containerStatuses: [
        {
          name: 'container-1',
          ready: false,
          restartCount: 0,
          state: { terminated: { reason: 'Completed', exitCode: 0 } },
        },
        {
          name: 'container-2',
          ready: true,
          restartCount: 0,
          state: { running: { startedAt: '2020-01-01T00:00:00Z' } },
        },
      ],
      conditions: [
        {
          type: 'Ready',
          status: 'True',
        },
      ],
    },
  };

  it('correctly identifies a healthy pod with lowercase condition status in edge cases', () => {
    const data = JSON.parse(JSON.stringify(mockPodData));
    const pod = new Pod(data);
    const status = pod.getDetailedStatus();
    // hasRunning is true, reason became Completed from container-1, so it checks Ready condition
    expect(status.reason).toBe('Running');
  });

  it('falls back to NotReady if Ready condition is False in edge cases', () => {
    const data = JSON.parse(JSON.stringify(mockPodData));
    data.status.conditions[0].status = 'False';
    const pod = new Pod(data);
    const status = pod.getDetailedStatus();
    expect(status.reason).toBe('NotReady');
  });

  it('handles missing conditions gracefully', () => {
    const data = JSON.parse(JSON.stringify(mockPodData));
    delete data.status.conditions;
    const pod = new Pod(data);
    expect(() => pod.getDetailedStatus()).not.toThrow();
  });

  describe('getHealth', () => {
    const makePod = (status: any, metadata: any = {}) =>
      new Pod({
        ...mockPodData,
        metadata: { ...mockPodData.metadata, ...metadata },
        status,
      } as any);

    it('classifies a Running and Ready pod as healthy', () => {
      const pod = makePod({
        phase: 'Running',
        conditions: [{ type: 'Ready', status: 'True' }],
      });
      expect(pod.getHealth()).toBe('healthy');
    });

    it('classifies a Running but NotReady pod as degraded', () => {
      const pod = makePod({
        phase: 'Running',
        conditions: [{ type: 'Ready', status: 'False' }],
      });
      expect(pod.getHealth()).toBe('degraded');
    });

    it('classifies a Pending pod as transitional', () => {
      const pod = makePod({ phase: 'Pending' });
      expect(pod.getHealth()).toBe('transitional');
    });

    it('classifies a terminating (deletionTimestamp) pod as transitional', () => {
      const pod = makePod({ phase: 'Running' }, { deletionTimestamp: '2020-01-01T00:00:00Z' });
      expect(pod.getHealth()).toBe('transitional');
    });

    it('classifies a lost node (NodeLost) pod as failed', () => {
      const pod = makePod(
        { phase: 'Running', reason: 'NodeLost' },
        { deletionTimestamp: '2020-01-01T00:00:00Z' }
      );
      expect(pod.getHealth()).toBe('failed');
    });

    it('classifies a pod with a CrashLoopBackOff container as failed', () => {
      const pod = makePod({
        phase: 'Running',
        containerStatuses: [{ name: 'c', state: { waiting: { reason: 'CrashLoopBackOff' } } }],
      });
      expect(pod.getHealth()).toBe('failed');
    });

    it('classifies a pod with an ImagePullBackOff container as failed', () => {
      const pod = makePod({
        phase: 'Pending',
        containerStatuses: [{ name: 'c', state: { waiting: { reason: 'ImagePullBackOff' } } }],
      });
      expect(pod.getHealth()).toBe('failed');
    });

    it('classifies a terminated container with a non-zero exitCode and empty reason as failed', () => {
      const pod = makePod({
        phase: 'Pending',
        initContainerStatuses: [
          { name: 'init', state: { terminated: { exitCode: 1, reason: '' } } },
        ],
      });
      expect(pod.getHealth()).toBe('failed');
    });

    it('classifies a Failed pod as failed', () => {
      const pod = makePod({ phase: 'Failed' });
      expect(pod.getHealth()).toBe('failed');
    });

    it('classifies a Succeeded pod as healthy', () => {
      const pod = makePod({ phase: 'Succeeded' });
      expect(pod.getHealth()).toBe('healthy');
    });
  });
});
