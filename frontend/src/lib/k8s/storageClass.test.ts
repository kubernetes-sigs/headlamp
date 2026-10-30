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
import StorageClass from './storageClass';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

function makeStorageClass(annotations?: Record<string, string>) {
  return new StorageClass({
    apiVersion: 'storage.k8s.io/v1',
    kind: 'StorageClass',
    metadata: {
      name: 'standard',
      uid: 'uid',
      creationTimestamp: '2025-01-01T00:00:00Z',
      annotations,
    },
    provisioner: 'kubernetes.io/no-provisioner',
    reclaimPolicy: 'Delete',
    volumeBindingMode: 'Immediate',
  });
}

describe('StorageClass isDefault', () => {
  it('is true with the GA annotation', () => {
    expect(
      makeStorageClass({ 'storageclass.kubernetes.io/is-default-class': 'true' }).isDefault
    ).toBe(true);
  });

  it('is true with the beta annotation', () => {
    expect(
      makeStorageClass({ 'storageclass.beta.kubernetes.io/is-default-class': 'true' }).isDefault
    ).toBe(true);
  });

  it('is false when the annotations are not "true"', () => {
    expect(
      makeStorageClass({
        'storageclass.kubernetes.io/is-default-class': 'false',
        'storageclass.beta.kubernetes.io/is-default-class': 'false',
      }).isDefault
    ).toBe(false);
  });

  it('is false without annotations', () => {
    expect(makeStorageClass().isDefault).toBe(false);
    expect(makeStorageClass({}).isDefault).toBe(false);
  });
});
