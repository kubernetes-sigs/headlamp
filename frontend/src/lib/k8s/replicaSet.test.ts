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
import ReplicaSet from './replicaSet';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('ReplicaSet class', () => {
  const mockReplicaSetData = {
    apiVersion: 'apps/v1',
    kind: 'ReplicaSet',
    metadata: {
      name: 'test-replicaset',
      namespace: 'default',
      uid: 'rs-uid-123',
      resourceVersion: '456',
      generation: 3,
    },
    spec: {
      minReadySeconds: 0,
      replicas: 3,
      selector: {
        matchLabels: { app: 'myapp', version: 'v1' },
      },
      template: {
        spec: {
          containers: [
            { name: 'app', image: 'myapp:v1', imagePullPolicy: 'Always' },
            { name: 'sidecar', image: 'sidecar:v1', imagePullPolicy: 'IfNotPresent' },
          ],
          nodeName: 'node-1',
        },
      },
    },
    status: {
      availableReplicas: 3,
      conditions: [],
      fullyLabeledReplicas: 3,
      observedGeneration: 3,
      readyReplicas: 2,
      replicas: 3,
    },
  };

  describe('getBaseObject', () => {
    it('returns a ReplicaSet with correct defaults', () => {
      const base = ReplicaSet.getBaseObject();
      expect(base.kind).toBe('ReplicaSet');
      expect(base.apiVersion).toBe('apps/v1');
      expect(base.metadata.namespace).toBe('');
      expect(base.spec.selector.matchLabels).toEqual({ app: 'headlamp' });
      expect(base.spec.minReadySeconds).toBe(0);
      expect(base.spec.replicas).toBe(1);
    });

    it('includes a default container template', () => {
      const base = ReplicaSet.getBaseObject();
      expect(base.spec.template.spec.containers).toHaveLength(1);
      expect(base.spec.template.spec.containers[0].name).toBe('');
      expect(base.spec.template.spec.containers[0].image).toBe('');
      expect(base.spec.template.spec.containers[0].imagePullPolicy).toBe('Always');
    });

    it('has isScalable static property set to true', () => {
      expect(ReplicaSet.isScalable).toBe(true);
    });
  });

  describe('getContainers', () => {
    it('returns all containers from the pod template spec', () => {
      const rs = new ReplicaSet(JSON.parse(JSON.stringify(mockReplicaSetData)));
      const containers = rs.getContainers();
      expect(containers).toHaveLength(2);
      expect(containers[0].name).toBe('app');
      expect(containers[1].name).toBe('sidecar');
    });

    it('returns empty array when spec is missing', () => {
      const data = JSON.parse(JSON.stringify(mockReplicaSetData));
      delete data.spec;
      const rs = new ReplicaSet(data);
      expect(rs.getContainers()).toEqual([]);
    });

    it('returns empty array when template is missing', () => {
      const data = JSON.parse(JSON.stringify(mockReplicaSetData));
      delete data.spec.template;
      const rs = new ReplicaSet(data);
      expect(rs.getContainers()).toEqual([]);
    });
  });

  describe('getMatchLabelsList', () => {
    it('returns matchLabels entries as key=value pairs', () => {
      const rs = new ReplicaSet(JSON.parse(JSON.stringify(mockReplicaSetData)));
      const labels = rs.getMatchLabelsList();
      expect(labels).toContain('app=myapp');
      expect(labels).toContain('version=v1');
      expect(labels).toHaveLength(2);
    });

    it('returns empty array when no matchLabels defined', () => {
      const data = JSON.parse(JSON.stringify(mockReplicaSetData));
      data.spec.selector.matchLabels = {};
      const rs = new ReplicaSet(data);
      expect(rs.getMatchLabelsList()).toEqual([]);
    });
  });
});
