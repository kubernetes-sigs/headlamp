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
import CSINode from './csiNode';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

function makeCSINode(drivers?: any) {
  return new CSINode({
    apiVersion: 'storage.k8s.io/v1',
    kind: 'CSINode',
    metadata: {
      name: 'my-node',
      uid: 'uid',
      creationTimestamp: '2025-01-01T00:00:00Z',
    },
    spec: drivers === undefined ? ({} as any) : { drivers },
  });
}

describe('CSINode drivers', () => {
  it('returns the registered drivers', () => {
    const drivers = [{ name: 'csi.test', nodeID: 'node-id-1' }];
    expect(makeCSINode(drivers).drivers).toEqual(drivers);
  });

  it('is an empty array when there are no drivers', () => {
    expect(makeCSINode([]).drivers).toEqual([]);
    expect(makeCSINode().drivers).toEqual([]);
  });
});
