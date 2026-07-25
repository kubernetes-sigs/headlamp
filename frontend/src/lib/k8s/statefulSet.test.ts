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
import StatefulSet from './statefulSet';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('StatefulSet class', () => {
  const mockStatefulSetData = {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: {
      name: 'test-statefulset',
      namespace: 'default',
      uid: 'sts-uid-123',
      resourceVersion: '789',
      generation: 2,
    },
    spec: {
      selector: {
        matchLabels: { app: 'myapp' },
      },
      serviceName: 'my-service',
      podManagementPolicy: 'OrderedReady',
      updateStrategy: {
        type: 'RollingUpdate',
        rollingUpdate: { partition: 0 },
      },
      template: {
        spec: {
          containers: [
            { name: 'db', image: 'postgres:15', imagePullPolicy: 'Always' },
            { name: 'exporter', image: 'pg-exporter:v2', imagePullPolicy: 'IfNotPresent' },
          ],
          nodeName: 'node-1',
        },
      },
    },
    status: {
      observedGeneration: 2,
    },
  };

  describe('getBaseObject', () => {
    it('returns a StatefulSet with correct defaults', () => {
      const base = StatefulSet.getBaseObject();
      expect(base.kind).toBe('StatefulSet');
      expect(base.apiVersion).toBe('apps/v1');
      expect(base.metadata.namespace).toBe('');
      expect(base.spec.selector.matchLabels).toEqual({ app: 'headlamp' });
      expect(base.spec.updateStrategy.type).toBe('RollingUpdate');
      expect(base.spec.updateStrategy.rollingUpdate.partition).toBe(0);
    });

    it('includes a default container template', () => {
      const base = StatefulSet.getBaseObject();
      expect(base.spec.template.spec.containers).toHaveLength(1);
      expect(base.spec.template.spec.containers![0].name).toBe('');
      expect(base.spec.template.spec.containers![0].image).toBe('');
      expect(base.spec.template.spec.containers![0].imagePullPolicy).toBe('Always');
    });

    it('has isScalable static property set to true', () => {
      expect(StatefulSet.isScalable).toBe(true);
    });
  });

  describe('getContainers', () => {
    it('returns all containers from the pod template spec', () => {
      const sts = new StatefulSet(JSON.parse(JSON.stringify(mockStatefulSetData)));
      const containers = sts.getContainers();
      expect(containers).toHaveLength(2);
      expect(containers[0].name).toBe('db');
      expect(containers[1].name).toBe('exporter');
    });

    it('returns empty array when spec is missing', () => {
      const data = JSON.parse(JSON.stringify(mockStatefulSetData));
      delete data.spec;
      const sts = new StatefulSet(data);
      expect(sts.getContainers()).toEqual([]);
    });

    it('returns empty array when template is missing', () => {
      const data = JSON.parse(JSON.stringify(mockStatefulSetData));
      delete data.spec.template;
      const sts = new StatefulSet(data);
      expect(sts.getContainers()).toEqual([]);
    });
  });

  describe('getCurrentRevision', () => {
    it('returns observedGeneration when available', () => {
      const sts = new StatefulSet(JSON.parse(JSON.stringify(mockStatefulSetData)));
      expect(sts.getCurrentRevision()).toBe('2');
    });

    it('falls back to metadata.generation when observedGeneration is missing', () => {
      const data = JSON.parse(JSON.stringify(mockStatefulSetData));
      delete data.status.observedGeneration;
      const sts = new StatefulSet(data);
      expect(sts.getCurrentRevision()).toBe('2');
    });

    it('returns empty string when no generation or observedGeneration exists', () => {
      const data = JSON.parse(JSON.stringify(mockStatefulSetData));
      delete data.status.observedGeneration;
      data.metadata.generation = undefined;
      const sts = new StatefulSet(data);
      expect(sts.getCurrentRevision()).toBe('');
    });
  });
});
