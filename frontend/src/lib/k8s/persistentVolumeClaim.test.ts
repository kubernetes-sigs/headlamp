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

import { describe, expect, it, vi } from 'vitest';
import App from '../../App';
import PersistentVolumeClaim, { KubePersistentVolumeClaim } from './persistentVolumeClaim';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const makeClaim = (
  spec?: KubePersistentVolumeClaim['spec'],
  status?: KubePersistentVolumeClaim['status']
) =>
  new PersistentVolumeClaim({
    kind: 'PersistentVolumeClaim',
    apiVersion: 'v1',
    metadata: {
      name: 'my-pvc',
      namespace: 'default',
      uid: 'abc-1234',
      creationTimestamp: '2023-04-27T20:31:27Z',
      resourceVersion: '1234',
    },
    spec,
    status,
  } as KubePersistentVolumeClaim);

describe('PersistentVolumeClaim', () => {
  it('reads the requested storage from the spec', () => {
    expect(makeClaim({ resources: { requests: { storage: '8Gi' } } }).requestedStorage).toBe('8Gi');
    expect(makeClaim({}).requestedStorage).toBeUndefined();
  });

  describe('resizeCondition', () => {
    it('reports a volume that is still growing', () => {
      const claim = makeClaim(undefined, {
        conditions: [{ type: 'Resizing', status: 'True', lastProbeTime: '' }],
      });

      expect(claim.resizeCondition?.type).toBe('Resizing');
    });

    it('reports a file system waiting for the node to remount it', () => {
      const claim = makeClaim(undefined, {
        conditions: [{ type: 'FileSystemResizePending', status: 'True', lastProbeTime: '' }],
      });

      expect(claim.resizeCondition?.type).toBe('FileSystemResizePending');
    });

    it('ignores conditions that are not about resizing, and ones that are not set', () => {
      const claim = makeClaim(undefined, {
        conditions: [
          { type: 'Resizing', status: 'False', lastProbeTime: '' },
          { type: 'Pending', status: 'True', lastProbeTime: '' },
        ],
      });

      expect(claim.resizeCondition).toBeUndefined();
      expect(makeClaim().resizeCondition).toBeUndefined();
    });
  });

  it('expands by patching the requested storage', () => {
    const claim = makeClaim({ resources: { requests: { storage: '8Gi' } } });
    const patch = vi.spyOn(claim, 'patch').mockResolvedValue({});

    claim.expandTo('16Gi');

    expect(patch).toHaveBeenCalledWith({
      spec: { resources: { requests: { storage: '16Gi' } } },
    });
  });
});
