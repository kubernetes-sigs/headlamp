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
import type { KubeResourceSlice, ResourceSliceSpec } from './resourceSlice';
import ResourceSlice from './resourceSlice';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const pool = { name: 'gpu-worker-0', generation: 1, resourceSliceCount: 1 };

const makeSlice = (spec: Partial<ResourceSliceSpec>) =>
  new ResourceSlice({
    kind: 'ResourceSlice',
    apiVersion: 'resource.k8s.io/v1',
    metadata: {
      name: 'gpu-worker-0-gpu.example.com-87fv4',
      uid: 'slice-uid',
      creationTimestamp: '2026-09-20T15:00:00Z',
    },
    spec: { driver: 'gpu.example.com', pool, ...spec },
  } as KubeResourceSlice);

describe('ResourceSlice', () => {
  it('is a cluster scoped resource.k8s.io resource', () => {
    expect(ResourceSlice.apiVersion).toBe('resource.k8s.io/v1');
    expect(ResourceSlice.apiName).toBe('resourceslices');
    expect(ResourceSlice.isNamespaced).toBe(false);
    expect(ResourceSlice.apiGroupName).toBe('resource.k8s.io');
  });

  it('reads the driver, the pool and the devices', () => {
    const slice = makeSlice({ nodeName: 'gpu-worker-0', devices: [{ name: 'gpu-0' }] });

    expect(slice.driver).toBe('gpu.example.com');
    expect(slice.poolName).toBe('gpu-worker-0');
    expect(slice.devices.map(device => device.name)).toEqual(['gpu-0']);
  });

  it('has no devices when the driver publishes none', () => {
    expect(makeSlice({ nodeName: 'gpu-worker-0' }).devices).toEqual([]);
  });

  it.each([
    [{ nodeName: 'gpu-worker-0' }, 'node'],
    [{ nodeSelector: { nodeSelectorTerms: [] } }, 'nodeSelector'],
    [{ allNodes: true }, 'allNodes'],
    [{ perDeviceNodeSelection: true }, 'perDevice'],
    [{}, undefined],
  ] as [Partial<ResourceSliceSpec>, string | undefined][])(
    'tells where its devices can be used from: %o',
    (spec, access) => {
      expect(makeSlice(spec).nodeAccess).toBe(access);
    }
  );
});
