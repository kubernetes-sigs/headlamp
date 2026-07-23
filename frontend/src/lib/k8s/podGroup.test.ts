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
import App from '../../App';
import type { KubePodGroup } from './podGroup';
import PodGroup, { getSchedulingPolicyKind } from './podGroup';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('./api/v1/clusterRequests', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v1/clusterRequests')>()),
  request: mockRequest,
}));

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const makePodGroup = (spec: Partial<KubePodGroup['spec']>, status?: KubePodGroup['status']) =>
  new PodGroup({
    kind: 'PodGroup',
    apiVersion: 'scheduling.k8s.io/v1alpha2',
    metadata: {
      name: 'training-job-workers',
      namespace: 'gang-demo',
      uid: 'uid-1',
      creationTimestamp: '2026-01-01T00:00:00Z',
    },
    spec: { schedulingPolicy: {}, ...spec },
    status,
  } as KubePodGroup);

describe('getSchedulingPolicyKind', () => {
  it('recognizes the gang and basic policies', () => {
    expect(getSchedulingPolicyKind({ gang: { minCount: 4 } })).toBe('Gang');
    expect(getSchedulingPolicyKind({ basic: {} })).toBe('Basic');
  });

  it('returns undefined when no policy is set', () => {
    expect(getSchedulingPolicyKind({})).toBeUndefined();
    expect(getSchedulingPolicyKind(undefined)).toBeUndefined();
  });
});

describe('PodGroup', () => {
  it('exposes the gang policy and its minimum count', () => {
    const podGroup = makePodGroup({ schedulingPolicy: { gang: { minCount: 4 } } });

    expect(podGroup.policyKind).toBe('Gang');
    expect(podGroup.minCount).toBe(4);
  });

  it('has no minimum count for the basic policy', () => {
    const podGroup = makePodGroup({ schedulingPolicy: { basic: {} } });

    expect(podGroup.policyKind).toBe('Basic');
    expect(podGroup.minCount).toBeUndefined();
  });

  it('reads the workload name from the template reference', () => {
    const podGroup = makePodGroup({
      podGroupTemplateRef: {
        workload: { workloadName: 'training-job', podGroupTemplateName: 'workers' },
      },
    });

    expect(podGroup.workloadName).toBe('training-job');
  });

  it('has no workload name when the group was not templated', () => {
    expect(makePodGroup({}).workloadName).toBeUndefined();
  });

  it('picks the PodGroupScheduled condition out of the status', () => {
    const podGroup = makePodGroup(
      {},
      {
        conditions: [
          { type: 'DisruptionTarget', status: 'False', lastProbeTime: '' },
          { type: 'PodGroupScheduled', status: 'True', reason: 'Scheduled', lastProbeTime: '' },
        ],
      }
    );

    expect(podGroup.schedulingCondition?.reason).toBe('Scheduled');
  });

  it('has no scheduling condition when the status is empty', () => {
    expect(makePodGroup({}).schedulingCondition).toBeUndefined();
    expect(makePodGroup({}, { conditions: [] }).schedulingCondition).toBeUndefined();
  });
});

describe('PodGroup.isEnabled', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('is true when the newest served version has the resource', async () => {
    mockRequest.mockResolvedValueOnce({ resources: [{ name: 'podgroups' }] });

    expect(await PodGroup.isEnabled('test-cluster')).toBe(true);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest.mock.calls[0][0]).toBe('/apis/scheduling.k8s.io/v1alpha3');
  });

  it('falls back to the previous version when the newest is not served', async () => {
    mockRequest.mockRejectedValueOnce(
      new Error('the server could not find the requested resource')
    );
    mockRequest.mockResolvedValueOnce({ resources: [{ name: 'podgroups' }] });

    expect(await PodGroup.isEnabled('test-cluster')).toBe(true);
    expect(mockRequest.mock.calls.map(call => call[0])).toEqual([
      '/apis/scheduling.k8s.io/v1alpha3',
      '/apis/scheduling.k8s.io/v1alpha2',
    ]);
  });

  it('is false when no candidate version is served', async () => {
    mockRequest.mockRejectedValue(new Error('the server could not find the requested resource'));

    expect(await PodGroup.isEnabled('test-cluster')).toBe(false);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });
});
