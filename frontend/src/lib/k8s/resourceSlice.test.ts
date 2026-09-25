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
import ResourceSlice from './resourceSlice';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('ResourceSlice', () => {
  it('has correct static metadata', () => {
    expect(ResourceSlice.kind).toBe('ResourceSlice');
    expect(ResourceSlice.apiName).toBe('resourceslices');
    expect(ResourceSlice.apiVersion).toBe('resource.k8s.io/v1');
    expect(ResourceSlice.isNamespaced).toBe(false);
  });

  it('correctly parses driver, nodeName, and devices', () => {
    const slice = new ResourceSlice({
      apiVersion: 'resource.k8s.io/v1',
      kind: 'ResourceSlice',
      metadata: {
        name: 'gpu-slice-1',
        uid: 'test-slice-uid',
        creationTimestamp: '2026-08-12T00:00:00Z',
      },
      spec: {
        driver: 'gpu.example.com',
        nodeName: 'worker-node-1',
        devices: [
          {
            name: 'gpu-0',
            basic: {
              attributes: {
                model: 'A100',
              },
            },
          },
        ],
      },
    });

    expect(slice.driver).toBe('gpu.example.com');
    expect(slice.nodeName).toBe('worker-node-1');
    expect(slice.devices).toHaveLength(1);
    expect(slice.devices[0].name).toBe('gpu-0');
  });

  it('returns empty array fallback for missing devices', () => {
    const slice = new ResourceSlice({
      apiVersion: 'resource.k8s.io/v1',
      kind: 'ResourceSlice',
      metadata: {
        name: 'gpu-slice-empty',
        uid: 'test-slice-uid-2',
        creationTimestamp: '2026-08-12T00:00:00Z',
      },
      spec: {
        driver: 'gpu.example.com',
      },
    });

    expect(slice.devices).toEqual([]);
  });
});
