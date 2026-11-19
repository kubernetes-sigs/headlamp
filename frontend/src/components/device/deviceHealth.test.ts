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
import type { ResourceStatus } from '../../lib/k8s/cluster';
import type { KubePod } from '../../lib/k8s/pod';
import Pod from '../../lib/k8s/pod';
import ResourceClaim from '../../lib/k8s/resourceClaim';
import { getDeviceHealth } from './deviceHealth';
import { DEVICE_HEALTH_POD, RESOURCE_CLAIM_DUMMY_DATA } from './storyHelper';

const claim = new ResourceClaim(RESOURCE_CLAIM_DUMMY_DATA[3]);
const [gpu2, gpu3] = claim.allocatedDevices;

const reporting = (
  allocatedResourcesStatus: ResourceStatus[],
  pod = DEVICE_HEALTH_POD
): KubePod => ({
  ...pod,
  status: {
    ...pod.status,
    containerStatuses: pod.status.containerStatuses.map(status => ({
      ...status,
      allocatedResourcesStatus,
    })),
  },
});

const withHealth = (health: 'Healthy' | 'Unhealthy', name = 'claim:gpus/gpu-1') =>
  reporting([{ name, resources: [{ resourceID: `gpu.example.com/${gpu2.pool}/gpu-2`, health }] }]);

describe('getDeviceHealth', () => {
  it('returns what the Pod reports for the device', () => {
    const pods = [new Pod(DEVICE_HEALTH_POD)];

    expect(getDeviceHealth(gpu2, claim, pods)?.health).toBe('Healthy');
    expect(getDeviceHealth(gpu3, claim, pods)).toEqual({
      resourceID: `gpu.example.com/${gpu3.pool}/gpu-3`,
      health: 'Unhealthy',
      message: 'ECC error count exceeded threshold',
    });
  });

  it('reports Unhealthy when the Pods sharing a device disagree', () => {
    const pods = [new Pod(withHealth('Healthy')), new Pod(withHealth('Unhealthy'))];

    expect(getDeviceHealth(gpu2, claim, pods)?.health).toBe('Unhealthy');
  });

  it('matches a device the kubelet names by its CDI device ID through its request', () => {
    const pods = [
      new Pod(
        reporting([
          {
            name: 'claim:gpus/gpu-2',
            resources: [{ resourceID: 'example.com/gpu=gpu-3', health: 'Unhealthy' }],
          },
        ])
      ),
    ];

    expect(getDeviceHealth(gpu3, claim, pods)?.health).toBe('Unhealthy');
    expect(getDeviceHealth(gpu2, claim, pods)).toBeUndefined();
  });

  it('does not guess which device a CDI device ID is when the claim has several', () => {
    const pods = [
      new Pod(
        reporting([
          {
            name: 'claim:gpus',
            resources: [
              { resourceID: 'example.com/gpu=gpu-2', health: 'Healthy' },
              { resourceID: 'example.com/gpu=gpu-3', health: 'Unhealthy' },
            ],
          },
        ])
      ),
    ];

    expect(getDeviceHealth(gpu2, claim, pods)).toBeUndefined();
    expect(getDeviceHealth(gpu3, claim, pods)).toBeUndefined();
  });

  it('returns nothing when no Pod reports the health', () => {
    expect(getDeviceHealth(gpu2, claim, [])).toBeUndefined();
    expect(getDeviceHealth(gpu2, claim, [new Pod(reporting([]))])).toBeUndefined();
  });

  it('ignores what a Pod reports for another of its claims', () => {
    const otherClaim = reporting(
      DEVICE_HEALTH_POD.status.containerStatuses[0].allocatedResourcesStatus!,
      {
        ...DEVICE_HEALTH_POD,
        status: {
          ...DEVICE_HEALTH_POD.status,
          resourceClaimStatuses: [{ name: 'gpus', resourceClaimName: 'another-claim' }],
        },
      }
    );

    expect(getDeviceHealth(gpu2, claim, [new Pod(otherClaim)])).toBeUndefined();
  });

  it('ignores resources that do not come from a claim', () => {
    const pods = [new Pod(withHealth('Unhealthy', 'example.com/gpu'))];

    expect(getDeviceHealth(gpu2, claim, pods)).toBeUndefined();
  });
});
