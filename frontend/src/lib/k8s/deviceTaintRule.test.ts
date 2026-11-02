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
import type { KubeDeviceTaintRule } from './deviceTaintRule';
import DeviceTaintRule from './deviceTaintRule';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('./api/v1/clusterRequests', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v1/clusterRequests')>()),
  request: mockRequest,
}));

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const makeRule = (rule: Partial<KubeDeviceTaintRule> = {}) =>
  new DeviceTaintRule({
    kind: 'DeviceTaintRule',
    apiVersion: 'resource.k8s.io/v1',
    metadata: { name: 'gpu-maintenance', uid: 'rule-uid' },
    spec: {
      deviceSelector: { driver: 'gpu.example.com', pool: 'worker-0' },
      taint: { key: 'gpu.example.com/unhealthy', value: 'true', effect: 'NoExecute' },
    },
    ...rule,
  } as KubeDeviceTaintRule);

describe('DeviceTaintRule', () => {
  it('is a cluster scoped resource.k8s.io resource', () => {
    expect(DeviceTaintRule.apiVersion).toBe('resource.k8s.io/v1');
    expect(DeviceTaintRule.apiName).toBe('devicetaintrules');
    expect(DeviceTaintRule.isNamespaced).toBe(false);
    expect(DeviceTaintRule.apiGroupName).toBe('resource.k8s.io');
  });

  it('exposes selector entries and recognizes an empty selector', () => {
    const rule = makeRule();
    expect(rule.selectorEntries).toEqual([
      { field: 'driver', value: 'gpu.example.com' },
      { field: 'pool', value: 'worker-0' },
    ]);
    expect(rule.matchesAllDevices).toBe(false);
    expect(makeRule({ spec: { taint: { effect: 'None', key: 'health' } } }).matchesAllDevices).toBe(
      true
    );
  });

  it('reads the eviction condition status', () => {
    const rule = makeRule({
      status: {
        conditions: [
          {
            type: 'EvictionInProgress',
            status: 'True',
            lastProbeTime: null,
            message: '1 pod needs to be evicted',
          },
        ],
      },
    });
    expect(rule.evictionCondition?.message).toBe('1 pod needs to be evicted');
    expect(rule.evictionInProgress).toBe(true);
    expect(makeRule().evictionInProgress).toBeUndefined();
    expect(
      makeRule({
        status: {
          conditions: [{ type: 'EvictionInProgress', status: 'Unknown', lastProbeTime: null }],
        },
      }).evictionInProgress
    ).toBeUndefined();
  });

  describe('isEnabled', () => {
    beforeEach(() => mockRequest.mockReset());

    it('is true when the cluster serves DeviceTaintRule', async () => {
      mockRequest.mockResolvedValue({ resources: [{ name: 'devicetaintrules' }] });

      await expect(DeviceTaintRule.isEnabled('dra')).resolves.toBe(true);
      expect(mockRequest).toHaveBeenCalledWith('/apis/resource.k8s.io/v1', { cluster: 'dra' });
    });

    it('is false when the cluster does not serve DeviceTaintRule', async () => {
      mockRequest.mockRejectedValueOnce(new Error('404'));

      await expect(DeviceTaintRule.isEnabled('legacy')).resolves.toBe(false);
    });
  });
});
