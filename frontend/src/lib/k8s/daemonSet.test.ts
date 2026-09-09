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
import DaemonSet from './daemonSet';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('DaemonSet class', () => {
  const mockDaemonSetData = {
    apiVersion: 'apps/v1',
    kind: 'DaemonSet',
    metadata: {
      name: 'test-daemonset',
      namespace: 'default',
      uid: 'ds-uid-123',
      resourceVersion: '456',
      generation: 3,
    },
    spec: {
      updateStrategy: {
        type: 'RollingUpdate',
        rollingUpdate: {
          maxUnavailable: 1,
        },
      },
      selector: {
        matchLabels: { app: 'myapp' },
      },
      template: {
        spec: {
          containers: [
            { name: 'app', image: 'myapp:v1', imagePullPolicy: 'Always' },
            { name: 'sidecar', image: 'sidecar:v1', imagePullPolicy: 'IfNotPresent' },
          ],
          nodeSelector: { disk: 'ssd', region: 'us-east-1' },
          nodeName: 'node-1',
        },
      },
    },
    status: {
      observedGeneration: 3,
    },
  };

  describe('getBaseObject', () => {
    it('returns a DaemonSet with correct defaults', () => {
      const base = DaemonSet.getBaseObject();
      expect(base.kind).toBe('DaemonSet');
      expect(base.apiVersion).toBe('apps/v1');
      expect(base.metadata.namespace).toBe('');
      expect(base.spec.updateStrategy.type).toBe('RollingUpdate');
      expect(base.spec.updateStrategy.rollingUpdate.maxUnavailable).toBe(1);
      expect(base.spec.selector.matchLabels).toEqual({ app: 'headlamp' });
    });

    it('includes a default container template', () => {
      const base = DaemonSet.getBaseObject();
      expect(base.spec.template.spec.containers).toHaveLength(1);
      expect(base.spec.template.spec.containers![0].name).toBe('');
      expect(base.spec.template.spec.containers![0].image).toBe('');
      expect(base.spec.template.spec.containers![0].imagePullPolicy).toBe('Always');
    });
  });

  describe('getContainers', () => {
    it('returns all containers from the pod template spec', () => {
      const ds = new DaemonSet(JSON.parse(JSON.stringify(mockDaemonSetData)));
      const containers = ds.getContainers();
      expect(containers).toHaveLength(2);
      expect(containers[0].name).toBe('app');
      expect(containers[1].name).toBe('sidecar');
    });

    it('returns empty array when spec is missing', () => {
      const data = JSON.parse(JSON.stringify(mockDaemonSetData));
      delete data.spec;
      const ds = new DaemonSet(data);
      expect(ds.getContainers()).toEqual([]);
    });

    it('returns empty array when template is missing', () => {
      const data = JSON.parse(JSON.stringify(mockDaemonSetData));
      delete data.spec.template;
      const ds = new DaemonSet(data);
      expect(ds.getContainers()).toEqual([]);
    });
  });

  describe('getNodeSelectors', () => {
    it('returns nodeSelector entries as key=value pairs', () => {
      const ds = new DaemonSet(JSON.parse(JSON.stringify(mockDaemonSetData)));
      const selectors = ds.getNodeSelectors();
      expect(selectors).toContain('disk=ssd');
      expect(selectors).toContain('region=us-east-1');
      expect(selectors).toHaveLength(2);
    });

    it('returns empty array when no nodeSelector defined', () => {
      const data = JSON.parse(JSON.stringify(mockDaemonSetData));
      delete data.spec.template.spec.nodeSelector;
      const ds = new DaemonSet(data);
      expect(ds.getNodeSelectors()).toEqual([]);
    });

    it('returns empty array when spec is missing', () => {
      const data = JSON.parse(JSON.stringify(mockDaemonSetData));
      delete data.spec;
      const ds = new DaemonSet(data);
      expect(ds.getNodeSelectors()).toEqual([]);
    });
  });

  describe('getCurrentRevision', () => {
    it('returns observedGeneration when available', () => {
      const ds = new DaemonSet(JSON.parse(JSON.stringify(mockDaemonSetData)));
      expect(ds.getCurrentRevision()).toBe('3');
    });

    it('falls back to metadata.generation when observedGeneration is missing', () => {
      const data = JSON.parse(JSON.stringify(mockDaemonSetData));
      delete data.status.observedGeneration;
      const ds = new DaemonSet(data);
      expect(ds.getCurrentRevision()).toBe('3');
    });

    it('returns empty string when no generation or observedGeneration exists', () => {
      const data = JSON.parse(JSON.stringify(mockDaemonSetData));
      delete data.status.observedGeneration;
      data.metadata.generation = undefined;
      const ds = new DaemonSet(data);
      expect(ds.getCurrentRevision()).toBe('');
    });
  });
});
