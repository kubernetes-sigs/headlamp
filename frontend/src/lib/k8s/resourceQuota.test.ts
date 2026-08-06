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
import ResourceQuota from './resourceQuota';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const makeQuota = (hard: Record<string, string>, used: Record<string, string> = {}) =>
  new ResourceQuota({
    apiVersion: 'v1',
    kind: 'ResourceQuota',
    metadata: { name: 'test-quota', namespace: 'default' },
    spec: { hard },
    status: { hard, used },
  } as any);

describe('ResourceQuota', () => {
  describe('counts', () => {
    it('reports object count quotas that requests and limits do not cover', () => {
      const quota = makeQuota(
        {
          pods: '10',
          services: '5',
          'count/deployments.apps': '3',
        },
        { pods: '2', services: '0', 'count/deployments.apps': '1' }
      );

      expect(quota.requests).toEqual([]);
      expect(quota.limits).toEqual([]);
      expect(quota.counts).toEqual(['pods: 2/10', 'services: 0/5', 'count/deployments.apps: 1/3']);
    });

    it('does not duplicate compute requests or limits', () => {
      const quota = makeQuota({
        cpu: '1',
        memory: '1Gi',
        'requests.cpu': '1',
        'limits.memory': '2Gi',
        pods: '8',
      });

      expect(quota.counts).toEqual(['pods: 0/8']);
    });

    it('does not treat compute shorthands as object counts', () => {
      const quota = makeQuota({
        'ephemeral-storage': '10Gi',
        'hugepages-2Mi': '100Mi',
        pods: '8',
      });

      expect(quota.counts).toEqual(['pods: 0/8']);
      expect(quota.requests).toEqual(['ephemeral-storage: 0/10Gi', 'hugepages-2Mi: 0/100Mi']);
    });

    it('classifies storage class scoped keys by the resource after the slash', () => {
      const quota = makeQuota({
        'gold.storageclass.storage.k8s.io/requests.storage': '500Gi',
        'gold.storageclass.storage.k8s.io/persistentvolumeclaims': '5',
      });

      expect(quota.counts).toEqual([
        'gold.storageclass.storage.k8s.io/persistentvolumeclaims: 0/5',
      ]);
      expect(quota.requests).toEqual([
        'gold.storageclass.storage.k8s.io/requests.storage: 0/500Gi',
      ]);
    });

    it('keeps qualified extended resources out of the counts', () => {
      const quota = makeQuota({
        'requests.nvidia.com/gpu': '4',
        'limits.nvidia.com/gpu': '4',
        pods: '8',
      });

      expect(quota.counts).toEqual(['pods: 0/8']);
      expect(quota.requests).toEqual(['requests.nvidia.com/gpu: 0/4']);
      expect(quota.limits).toEqual(['limits.nvidia.com/gpu: 0/4']);
    });

    it('is empty for a compute-only quota', () => {
      const quota = makeQuota({ 'requests.cpu': '1', 'limits.memory': '2Gi' });

      expect(quota.counts).toEqual([]);
    });

    it('defaults used to 0 when status has no entry', () => {
      const quota = makeQuota({ pods: '10' });

      expect(quota.counts).toEqual(['pods: 0/10']);
    });
  });
});
