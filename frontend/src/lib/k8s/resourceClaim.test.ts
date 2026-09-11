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
import ResourceClaim from './resourceClaim';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('ResourceClaim', () => {
  it('has correct static metadata', () => {
    expect(ResourceClaim.kind).toBe('ResourceClaim');
    expect(ResourceClaim.apiName).toBe('resourceclaims');
    expect(ResourceClaim.apiVersion).toBe('resource.k8s.io/v1');
    expect(ResourceClaim.isNamespaced).toBe(true);
  });

  it('correctly reports allocation status and requests', () => {
    const claim = new ResourceClaim({
      apiVersion: 'resource.k8s.io/v1',
      kind: 'ResourceClaim',
      metadata: {
        name: 'gpu-claim',
        namespace: 'default',
        uid: 'test-uid-2',
        creationTimestamp: '2026-08-12T00:00:00Z',
      },
      spec: {
        devices: {
          requests: [
            {
              name: 'req-gpu',
              deviceClassName: 'gpu.example.com',
            },
          ],
        },
      },
      status: {
        allocation: {
          devices: {
            results: [
              {
                driver: 'gpu.example.com',
                pool: 'node-1',
                device: 'gpu-0',
              },
            ],
          },
        },
      },
    });

    expect(claim.isAllocated).toBe(true);
    expect(claim.requests).toHaveLength(1);
    expect(claim.allocationResults).toEqual([
      {
        driver: 'gpu.example.com',
        pool: 'node-1',
        device: 'gpu-0',
      },
    ]);
  });
});
