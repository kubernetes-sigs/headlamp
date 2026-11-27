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
import type { KubeFlowSchema } from './flowSchema';
import FlowSchema from './flowSchema';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

/** Shaped after the system-leader-election schema every cluster ships. */
const makeSchema = (
  spec: Partial<KubeFlowSchema['spec']> = {},
  status?: KubeFlowSchema['status']
) =>
  new FlowSchema({
    kind: 'FlowSchema',
    apiVersion: 'flowcontrol.apiserver.k8s.io/v1',
    metadata: {
      name: 'system-leader-election',
      uid: 'fs-uid',
      creationTimestamp: '2026-10-21T20:50:16Z',
    },
    spec: {
      priorityLevelConfiguration: { name: 'leader-election' },
      matchingPrecedence: 100,
      distinguisherMethod: { type: 'ByUser' },
      rules: [
        {
          subjects: [{ kind: 'User', user: { name: 'system:kube-controller-manager' } }],
          resourceRules: [
            {
              verbs: ['get', 'create', 'update'],
              apiGroups: ['coordination.k8s.io'],
              resources: ['leases'],
              namespaces: ['*'],
            },
          ],
        },
      ],
      ...spec,
    },
    status,
  } as KubeFlowSchema);

describe('FlowSchema', () => {
  it('is a cluster scoped flowcontrol.apiserver.k8s.io resource', () => {
    expect(FlowSchema.apiVersion).toBe('flowcontrol.apiserver.k8s.io/v1');
    expect(FlowSchema.apiName).toBe('flowschemas');
    expect(FlowSchema.isNamespaced).toBe(false);
    expect(FlowSchema.apiGroupName).toBe('flowcontrol.apiserver.k8s.io');
  });

  it('reads the priority level, precedence and distinguisher off the spec', () => {
    const schema = makeSchema();

    expect(schema.priorityLevelName).toBe('leader-election');
    expect(schema.matchingPrecedence).toBe(100);
    expect(schema.distinguisherMethod).toBe('ByUser');
    expect(schema.rules).toHaveLength(1);
  });

  it('leaves the distinguisher undefined when every request shares one flow', () => {
    expect(makeSchema({ distinguisherMethod: undefined }).distinguisherMethod).toBeUndefined();
  });

  describe('dangling', () => {
    it('is not dangling when the apiserver found the priority level', () => {
      // The condition is present but False, which is the healthy case.
      const schema = makeSchema({}, {
        conditions: [
          {
            type: 'Dangling',
            status: 'False',
            reason: 'Found',
            message: 'the PriorityLevelConfiguration object exists',
          },
        ],
      } as KubeFlowSchema['status']);

      expect(schema.isDangling).toBe(false);
    });

    it('is dangling when the named priority level does not exist', () => {
      const schema = makeSchema({}, {
        conditions: [{ type: 'Dangling', status: 'True', reason: 'NotFound' }],
      } as KubeFlowSchema['status']);

      expect(schema.isDangling).toBe(true);
    });

    it('is not dangling when the apiserver has reported nothing yet', () => {
      expect(makeSchema().isDangling).toBe(false);
      expect(makeSchema({}, { conditions: [] }).isDangling).toBe(false);
    });
  });
});
