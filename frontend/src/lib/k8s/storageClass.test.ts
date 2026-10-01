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

describe('StorageClass class', () => {
  describe('isDefault', () => {
    const makeStorageClass = (annotations?: Record<string, string>) =>
      new StorageClass({
        apiVersion: 'storage.k8s.io/v1',
        kind: 'StorageClass',
        metadata: {
          name: 'standard',
          ...(annotations ? { annotations } : {}),
        },
        provisioner: 'kubernetes.io/no-provisioner',
        reclaimPolicy: 'Delete',
        volumeBindingMode: 'Immediate',
      } as any);

    it('returns false when no annotations are present', () => {
      expect(makeStorageClass().isDefault).toBe(false);
    });

    it('returns true when GA is-default-class annotation is set to "true"', () => {
      expect(
        makeStorageClass({ 'storageclass.kubernetes.io/is-default-class': 'true' }).isDefault
      ).toBe(true);
    });

    it('returns true when beta is-default-class annotation is set to "true"', () => {
      expect(
        makeStorageClass({ 'storageclass.beta.kubernetes.io/is-default-class': 'true' }).isDefault
      ).toBe(true);
    });

    it('returns false when is-default-class annotations are set to "false"', () => {
      expect(
        makeStorageClass({ 'storageclass.kubernetes.io/is-default-class': 'false' }).isDefault
      ).toBe(false);
      expect(
        makeStorageClass({ 'storageclass.beta.kubernetes.io/is-default-class': 'false' }).isDefault
      ).toBe(false);
    });

    it('returns true when one annotation is "true" and the other is "false" (OR behavior)', () => {
      expect(
        makeStorageClass({
          'storageclass.kubernetes.io/is-default-class': 'false',
          'storageclass.beta.kubernetes.io/is-default-class': 'true',
        }).isDefault
      ).toBe(true);
      expect(
        makeStorageClass({
          'storageclass.kubernetes.io/is-default-class': 'true',
          'storageclass.beta.kubernetes.io/is-default-class': 'false',
        }).isDefault
      ).toBe(true);
    });

    it('returns false when both GA and beta annotations are set to "false"', () => {
      expect(
        makeStorageClass({
          'storageclass.kubernetes.io/is-default-class': 'false',
          'storageclass.beta.kubernetes.io/is-default-class': 'false',
        }).isDefault
      ).toBe(false);
    });
  });
});
