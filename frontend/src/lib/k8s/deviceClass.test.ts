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
import DeviceClass from './deviceClass';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('DeviceClass', () => {
  it('has correct static metadata', () => {
    expect(DeviceClass.kind).toBe('DeviceClass');
    expect(DeviceClass.apiName).toBe('deviceclasses');
    expect(DeviceClass.apiVersion).toBe('resource.k8s.io/v1');
    expect(DeviceClass.isNamespaced).toBe(false);
  });

  it('correctly parses selectors from json data', () => {
    const deviceClass = new DeviceClass({
      apiVersion: 'resource.k8s.io/v1',
      kind: 'DeviceClass',
      metadata: {
        name: 'gpu.example.com',
        uid: 'test-uid-1',
        creationTimestamp: '2026-08-12T00:00:00Z',
      },
      spec: {
        selectors: [
          {
            cel: {
              expression: 'device.driver == "gpu.example.com"',
            },
          },
        ],
      },
    });

    expect(deviceClass.selectors).toEqual([
      {
        cel: {
          expression: 'device.driver == "gpu.example.com"',
        },
      },
    ]);
  });
});
