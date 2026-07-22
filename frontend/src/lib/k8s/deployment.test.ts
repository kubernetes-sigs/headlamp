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
import Deployment from './deployment';
import ReplicaSet from './replicaSet';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('Deployment class', () => {
  const mockDeploymentData = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'test-deployment',
      namespace: 'default',
      resourceVersion: '42',
      annotations: {
        'deployment.kubernetes.io/revision': '3',
      },
    },
    spec: {
      selector: {
        matchLabels: { app: 'headlamp', env: 'production' },
      },
      template: {
        spec: {
          containers: [
            { name: 'web', image: 'nginx:1.25', imagePullPolicy: 'Always' },
            { name: 'sidecar', image: 'envoy:v1.28', imagePullPolicy: 'IfNotPresent' },
          ],
          nodeName: '',
        },
      },
    },
    status: {},
  };

  describe('getBaseObject', () => {
    it('returns a Deployment with correct kind and apiVersion', () => {
      const base = Deployment.getBaseObject();
      expect(base.kind).toBe('Deployment');
      expect(base.apiVersion).toBe('apps/v1');
    });

    it('sets namespace to empty string in base object', () => {
      const base = Deployment.getBaseObject();
      expect(base.metadata.namespace).toBe('');
    });

    it('sets metadata labels to app: headlamp', () => {
      const base = Deployment.getBaseObject();
      expect(base.metadata.labels).toEqual({ app: 'headlamp' });
    });

    it('includes a selector with matchLabels in base object', () => {
      const base = Deployment.getBaseObject();
      expect(base.spec.selector?.matchLabels).toEqual({ app: 'headlamp' });
    });

    it('includes one container with empty name and image in base object', () => {
      const base = Deployment.getBaseObject();
      const containers = base.spec.template.spec.containers;
      expect(containers).toHaveLength(1);
      expect(containers[0].name).toBe('');
      expect(containers[0].image).toBe('');
      expect(containers[0].ports).toEqual([{ containerPort: 80 }]);
    });
  });

  describe('getContainers', () => {
    it('returns all containers from spec.template.spec.containers', () => {
      const deployment = new Deployment(JSON.parse(JSON.stringify(mockDeploymentData)));
      const containers = deployment.getContainers();
      expect(containers).toHaveLength(2);
      expect(containers[0].name).toBe('web');
      expect(containers[1].name).toBe('sidecar');
    });

    it('returns empty array when containers are missing', () => {
      const data = JSON.parse(JSON.stringify(mockDeploymentData));
      delete data.spec.template.spec.containers;
      const deployment = new Deployment(data);
      expect(deployment.getContainers()).toEqual([]);
    });
  });

  describe('getMatchLabelsList', () => {
    it('returns key=value strings for each matchLabel', () => {
      const deployment = new Deployment(JSON.parse(JSON.stringify(mockDeploymentData)));
      const labels = deployment.getMatchLabelsList();
      expect(labels).toContain('app=headlamp');
      expect(labels).toContain('env=production');
      expect(labels).toHaveLength(2);
    });

    it('returns empty array when selector has no matchLabels', () => {
      const data = JSON.parse(JSON.stringify(mockDeploymentData));
      delete data.spec.selector.matchLabels;
      const deployment = new Deployment(data);
      expect(deployment.getMatchLabelsList()).toEqual([]);
    });

    it('returns empty array when selector is missing', () => {
      const data = JSON.parse(JSON.stringify(mockDeploymentData));
      delete data.spec.selector;
      const deployment = new Deployment(data);
      expect(deployment.getMatchLabelsList()).toEqual([]);
    });

    it('returns empty array when spec is missing entirely', () => {
      const data = JSON.parse(JSON.stringify(mockDeploymentData));
      delete data.spec;
      const deployment = new Deployment(data);
      expect(deployment.getMatchLabelsList()).toEqual([]);
    });
  });

  describe('getCurrentRevision', () => {
    it('returns the revision annotation value', () => {
      const deployment = new Deployment(JSON.parse(JSON.stringify(mockDeploymentData)));
      expect(deployment.getCurrentRevision()).toBe('3');
    });

    it("returns '0' when the revision annotation is absent", () => {
      const data = JSON.parse(JSON.stringify(mockDeploymentData));
      delete data.metadata.annotations;
      const deployment = new Deployment(data);
      expect(deployment.getCurrentRevision()).toBe('0');
    });
  });

  describe('rollback', () => {
    it('returns error when target revision is missing spec.template', async () => {
      const deployment = new Deployment(JSON.parse(JSON.stringify(mockDeploymentData)));

      // Stub getOwnedReplicaSets
      vi.spyOn(deployment, 'getOwnedReplicaSets').mockResolvedValue([
        {
          metadata: {
            annotations: { 'deployment.kubernetes.io/revision': '3' },
          },
          spec: { template: { spec: {} } },
        } as unknown as ReplicaSet,
        {
          metadata: {
            annotations: { 'deployment.kubernetes.io/revision': '2' },
          },
          spec: {}, // Missing template
        } as unknown as ReplicaSet,
      ]);

      const result = await deployment.rollback(2);
      expect(result).toEqual({
        success: false,
        message: 'Revision 2 template not found',
      });
    });

    it('returns error when target revision template is missing spec', async () => {
      const deployment = new Deployment(JSON.parse(JSON.stringify(mockDeploymentData)));

      // Stub getOwnedReplicaSets
      vi.spyOn(deployment, 'getOwnedReplicaSets').mockResolvedValue([
        {
          metadata: {
            annotations: { 'deployment.kubernetes.io/revision': '3' },
          },
          spec: { template: { spec: {} } },
        } as unknown as ReplicaSet,
        {
          metadata: {
            annotations: { 'deployment.kubernetes.io/revision': '2' },
          },
          spec: { template: {} }, // Missing template.spec
        } as unknown as ReplicaSet,
      ]);

      const result = await deployment.rollback(2);
      expect(result).toEqual({
        success: false,
        message: 'Revision 2 template not found',
      });
    });
  });
});
