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
import type { KubeDeviceClass } from './deviceClass';
import DeviceClass from './deviceClass';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('./api/v1/clusterRequests', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v1/clusterRequests')>()),
  request: mockRequest,
}));

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const makeDeviceClass = (spec: KubeDeviceClass['spec'], name = 'gpu.example.com') =>
  new DeviceClass({
    kind: 'DeviceClass',
    apiVersion: 'resource.k8s.io/v1',
    metadata: {
      name,
      uid: `uid-${name}`,
      creationTimestamp: '2026-09-20T15:00:00Z',
    },
    spec,
  } as KubeDeviceClass);

describe('DeviceClass', () => {
  it('is a cluster scoped resource.k8s.io resource', () => {
    expect(DeviceClass.apiVersion).toBe('resource.k8s.io/v1');
    expect(DeviceClass.apiName).toBe('deviceclasses');
    expect(DeviceClass.isNamespaced).toBe(false);
    expect(DeviceClass.apiGroupName).toBe('resource.k8s.io');
  });

  it('lists the CEL selector expressions as written', () => {
    const deviceClass = makeDeviceClass({
      selectors: [
        { cel: { expression: "device.driver == 'gpu.example.com'" } },
        {
          cel: {
            expression:
              "device.capacity['gpu.example.com'].memory.compareTo(quantity('40Gi')) >= 0",
          },
        },
      ],
    });

    expect(deviceClass.selectorExpressions).toEqual([
      "device.driver == 'gpu.example.com'",
      "device.capacity['gpu.example.com'].memory.compareTo(quantity('40Gi')) >= 0",
    ]);
    expect(deviceClass.matchesAllDevices).toBe(false);
  });

  it('matches every device when it has no selectors', () => {
    expect(makeDeviceClass({}).matchesAllDevices).toBe(true);
    expect(makeDeviceClass({ selectors: [] }).matchesAllDevices).toBe(true);
    // A selector of an unknown kind has no expression to show.
    expect(makeDeviceClass({ selectors: [{}] }).selectorExpressions).toEqual([]);
  });

  it('exposes the opaque driver configurations', () => {
    const parameters = { apiVersion: 'gpu.resource.example.com/v1alpha1', kind: 'GpuConfig' };
    const deviceClass = makeDeviceClass({
      config: [{ opaque: { driver: 'gpu.example.com', parameters } }, {}],
    });

    expect(deviceClass.driverConfigs).toEqual([{ driver: 'gpu.example.com', parameters }]);
    expect(makeDeviceClass({}).driverConfigs).toEqual([]);
  });

  it('exposes the extended resource name when the class is mapped to one', () => {
    expect(
      makeDeviceClass({ extendedResourceName: 'example.com/big-gpu' }).extendedResourceName
    ).toBe('example.com/big-gpu');
    expect(makeDeviceClass({}).extendedResourceName).toBeUndefined();
  });

  describe('isEnabled', () => {
    beforeEach(() => mockRequest.mockReset());

    it('is true when the cluster serves resource.k8s.io/v1 device classes', async () => {
      mockRequest.mockResolvedValue({ resources: [{ name: 'deviceclasses' }] });

      await expect(DeviceClass.isEnabled('dra')).resolves.toBe(true);
      expect(mockRequest).toHaveBeenCalledWith('/apis/resource.k8s.io/v1', { cluster: 'dra' });
    });

    it('is false when the cluster does not serve the DRA API', async () => {
      mockRequest.mockRejectedValueOnce(new Error('404'));

      expect(await DeviceClass.isEnabled('legacy')).toBe(false);
    });
  });
});
