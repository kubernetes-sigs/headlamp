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
import type { KubeResourceClaim } from './resourceClaim';
import ResourceClaim, { getRequestedDeviceClasses, getResourceClaimState } from './resourceClaim';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const makeClaim = (
  spec: KubeResourceClaim['spec'],
  status?: KubeResourceClaim['status'],
  name = 'single-gpu'
) =>
  new ResourceClaim({
    kind: 'ResourceClaim',
    apiVersion: 'resource.k8s.io/v1',
    metadata: {
      name,
      namespace: 'gpu-demo',
      uid: `uid-${name}`,
      creationTimestamp: '2026-09-20T15:00:00Z',
    },
    spec,
    status,
  } as KubeResourceClaim);

const exactRequest = (name = 'gpu', deviceClassName = 'gpu.example.com') => ({
  name,
  exactly: { deviceClassName, allocationMode: 'ExactCount' as const, count: 1 },
});

const allocationFor = (request: string, device: string) => ({
  allocation: {
    devices: {
      results: [{ request, driver: 'gpu.example.com', pool: 'worker-0', device }],
    },
  },
});

describe('getResourceClaimState', () => {
  it('is pending while the scheduler has not answered', () => {
    expect(getResourceClaimState(undefined)).toBe('Pending');
    expect(getResourceClaimState({})).toBe('Pending');
    expect(getResourceClaimState({ reservedFor: [] })).toBe('Pending');
  });

  it('is allocated once there is an allocation but nothing uses it', () => {
    expect(getResourceClaimState(allocationFor('gpu', 'gpu-0'))).toBe('Allocated');
    expect(getResourceClaimState({ ...allocationFor('gpu', 'gpu-0'), reservedFor: [] })).toBe(
      'Allocated'
    );
  });

  it('is in use once a consumer is reserved for it', () => {
    const status = {
      ...allocationFor('gpu', 'gpu-0'),
      reservedFor: [{ resource: 'pods', name: 'trainer-0', uid: 'pod-uid' }],
    };

    expect(getResourceClaimState(status)).toBe('InUse');
  });
});

describe('getRequestedDeviceClasses', () => {
  it('reads the class of an exact request', () => {
    expect(getRequestedDeviceClasses(exactRequest())).toEqual(['gpu.example.com']);
  });

  it('reads every alternative of a prioritized list, in order', () => {
    expect(
      getRequestedDeviceClasses({
        name: 'gpu',
        firstAvailable: [
          { name: 'big', deviceClassName: 'a100.example.com' },
          { name: 'small', deviceClassName: 'gpu.example.com' },
        ],
      })
    ).toEqual(['a100.example.com', 'gpu.example.com']);
  });

  it('has nothing to report for a request of an unknown kind', () => {
    expect(getRequestedDeviceClasses({ name: 'gpu' })).toEqual([]);
  });
});

describe('ResourceClaim', () => {
  it('is a namespaced resource.k8s.io resource', () => {
    expect(ResourceClaim.apiVersion).toBe('resource.k8s.io/v1');
    expect(ResourceClaim.apiName).toBe('resourceclaims');
    expect(ResourceClaim.isNamespaced).toBe(true);
    expect(ResourceClaim.apiGroupName).toBe('resource.k8s.io');
  });

  it('reads the requests, and reports none for an empty spec', () => {
    expect(makeClaim({ devices: { requests: [exactRequest()] } }).requests).toHaveLength(1);
    expect(makeClaim({}).requests).toEqual([]);
  });

  it('collects the requested classes across requests, without duplicates', () => {
    const claim = makeClaim({
      devices: {
        requests: [
          exactRequest('gpu-1'),
          exactRequest('gpu-2'),
          {
            name: 'fallback',
            firstAvailable: [
              { name: 'big', deviceClassName: 'a100.example.com' },
              { name: 'small', deviceClassName: 'gpu.example.com' },
            ],
          },
        ],
      },
    });

    expect(claim.requestedClasses).toEqual(['gpu.example.com', 'a100.example.com']);
  });

  it('reports a pending claim as unallocated, with nothing granted', () => {
    const claim = makeClaim({ devices: { requests: [exactRequest()] } });

    expect(claim.isAllocated).toBe(false);
    expect(claim.state).toBe('Pending');
    expect(claim.allocatedDevices).toEqual([]);
    expect(claim.consumers).toEqual([]);
    expect(claim.allocatedNodeName).toBeUndefined();
  });

  it('reads the granted devices and the consumers of an allocated claim', () => {
    const claim = makeClaim({ devices: { requests: [exactRequest()] } }, {
      ...allocationFor('gpu', 'gpu-0'),
      reservedFor: [
        { resource: 'pods', name: 'pod0', uid: 'pod-0-uid' },
        { resource: 'pods', name: 'pod1', uid: 'pod-1-uid' },
      ],
    } as KubeResourceClaim['status']);

    expect(claim.isAllocated).toBe(true);
    expect(claim.state).toBe('InUse');
    expect(claim.allocatedDevices).toEqual([
      { request: 'gpu', driver: 'gpu.example.com', pool: 'worker-0', device: 'gpu-0' },
    ]);
    expect(claim.consumers.map(consumer => consumer.name)).toEqual(['pod0', 'pod1']);
  });

  it('reads the node an allocation is restricted to', () => {
    const nodeSelector = (values: string[]) => ({
      nodeSelectorTerms: [{ matchFields: [{ key: 'metadata.name', operator: 'In', values }] }],
    });
    const withSelector = (selector: object) =>
      makeClaim({}, {
        allocation: { ...allocationFor('gpu', 'gpu-0').allocation, ...selector },
      } as KubeResourceClaim['status']);

    expect(withSelector({ nodeSelector: nodeSelector(['worker-0']) }).allocatedNodeName).toBe(
      'worker-0'
    );
    expect(
      withSelector({ nodeSelector: nodeSelector(['worker-0', 'worker-1']) }).allocatedNodeName
    ).toBeUndefined();
    expect(withSelector({}).allocatedNodeName).toBeUndefined();
  });
});
