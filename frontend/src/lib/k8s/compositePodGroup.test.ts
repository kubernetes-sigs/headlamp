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
import type { KubeCompositePodGroup } from './compositePodGroup';
import CompositePodGroup, { getCompositeDisruptionMode } from './compositePodGroup';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('./api/v1/clusterRequests', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v1/clusterRequests')>()),
  request: mockRequest,
}));

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const makeCompositePodGroup = (
  spec: Partial<KubeCompositePodGroup['spec']>,
  status?: KubeCompositePodGroup['status']
) =>
  new CompositePodGroup({
    kind: 'CompositePodGroup',
    apiVersion: 'scheduling.k8s.io/v1alpha3',
    metadata: {
      name: 'llm-serving-prefill',
      namespace: 'inference',
      uid: 'uid-1',
      creationTimestamp: '2026-01-01T00:00:00Z',
    },
    spec: { schedulingPolicy: {}, ...spec },
    status,
  } as KubeCompositePodGroup);

describe('getCompositeDisruptionMode', () => {
  it('reads whichever mode the composite sets', () => {
    expect(getCompositeDisruptionMode({ single: {} })).toBe('Single');
    expect(getCompositeDisruptionMode({ all: {} })).toBe('All');
  });

  it('returns undefined when no mode is set', () => {
    expect(getCompositeDisruptionMode(undefined)).toBeUndefined();
    expect(getCompositeDisruptionMode({})).toBeUndefined();
  });
});

describe('CompositePodGroup', () => {
  it('is served by v1alpha3 only, unlike the flat scheduling resources', () => {
    expect(CompositePodGroup.apiVersion).toEqual(['scheduling.k8s.io/v1alpha3']);
  });

  it('exposes the gang policy and its minimum group count', () => {
    const composite = makeCompositePodGroup({
      schedulingPolicy: { gang: { minGroupCount: 2 } },
    });

    expect(composite.policyKind).toBe('Gang');
    expect(composite.minGroupCount).toBe(2);
  });

  it('has no minimum group count for the basic policy', () => {
    const composite = makeCompositePodGroup({ schedulingPolicy: { basic: {} } });

    expect(composite.policyKind).toBe('Basic');
    expect(composite.minGroupCount).toBeUndefined();
  });

  it('reads the workload and template names from the workload reference', () => {
    const composite = makeCompositePodGroup({
      workloadRef: { workloadName: 'llm-serving', templateName: 'prefill' },
    });

    expect(composite.workloadName).toBe('llm-serving');
    expect(composite.compositePodGroupTemplateName).toBe('prefill');
  });

  it('has no workload or template name when the group was not templated', () => {
    expect(makeCompositePodGroup({}).workloadName).toBeUndefined();
    expect(makeCompositePodGroup({}).compositePodGroupTemplateName).toBeUndefined();
  });

  it('is a hierarchy root when no parent is set', () => {
    expect(makeCompositePodGroup({}).parentCompositePodGroupName).toBeUndefined();
    expect(
      makeCompositePodGroup({ parentCompositePodGroupName: 'llm-serving-serving' })
        .parentCompositePodGroupName
    ).toBe('llm-serving-serving');
  });

  it('normalizes the disruption mode', () => {
    expect(makeCompositePodGroup({ disruptionMode: { single: {} } }).disruptionMode).toBe('Single');
    expect(makeCompositePodGroup({ disruptionMode: { all: {} } }).disruptionMode).toBe('All');
    expect(makeCompositePodGroup({}).disruptionMode).toBeUndefined();
  });

  it('picks its own scheduling condition out of the status', () => {
    const composite = makeCompositePodGroup(
      {},
      {
        conditions: [
          { type: 'DisruptionTarget', status: 'False', lastProbeTime: '' },
          {
            type: 'CompositePodGroupInitiallyScheduled',
            status: 'False',
            reason: 'Unschedulable',
            lastProbeTime: '',
          },
        ],
      }
    );

    expect(composite.schedulingCondition?.reason).toBe('Unschedulable');
  });

  it('does not mistake the condition of a child pod group for its own', () => {
    const composite = makeCompositePodGroup(
      {},
      {
        conditions: [{ type: 'PodGroupInitiallyScheduled', status: 'True', lastProbeTime: '' }],
      }
    );

    expect(composite.schedulingCondition).toBeUndefined();
  });

  it('has no scheduling condition when the status is empty', () => {
    expect(makeCompositePodGroup({}).schedulingCondition).toBeUndefined();
    expect(makeCompositePodGroup({}, { conditions: [] }).schedulingCondition).toBeUndefined();
  });
});

describe('CompositePodGroup.isEnabled', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('is true when v1alpha3 serves the resource', async () => {
    mockRequest.mockResolvedValueOnce({ resources: [{ name: 'compositepodgroups' }] });

    expect(await CompositePodGroup.isEnabled('test-cluster')).toBe(true);
    expect(mockRequest.mock.calls.map(call => call[0])).toEqual([
      '/apis/scheduling.k8s.io/v1alpha3',
    ]);
  });

  it('is false on a cluster that serves the flat resources but not this one', async () => {
    mockRequest.mockResolvedValueOnce({
      resources: [{ name: 'podgroups' }, { name: 'workloads' }],
    });

    expect(await CompositePodGroup.isEnabled('test-cluster')).toBe(false);
  });

  it('is false when v1alpha3 is not served at all', async () => {
    mockRequest.mockRejectedValue(new Error('the server could not find the requested resource'));

    expect(await CompositePodGroup.isEnabled('test-cluster')).toBe(false);
  });
});
