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

import App from '../../../App';
import PodGroup, {
  POD_GROUP_INITIALLY_SCHEDULED_CONDITION,
  POD_GROUP_SCHEDULED_CONDITION,
} from '../../../lib/k8s/podGroup';
import { getGraphNodeStatus, getStatus } from './KubeObjectStatus';

// Initialize the complete Kubernetes class registry before loading the status helpers.
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const podGroup = (conditions?: Record<string, any>[]) =>
  new PodGroup(
    {
      apiVersion: 'scheduling.k8s.io/v1beta1',
      kind: 'PodGroup',
      metadata: { uid: 'group', name: 'workers', namespace: 'namespace-a' },
      spec: { schedulingPolicy: { gang: { minCount: 2 } } },
      status: conditions ? { conditions } : {},
    } as any,
    'cluster-a'
  );

describe('getStatus for a PodGroup', () => {
  it.each([POD_GROUP_INITIALLY_SCHEDULED_CONDITION, POD_GROUP_SCHEDULED_CONDITION])(
    'reports a scheduled group as successful through the %s condition',
    type => {
      expect(getStatus(podGroup([{ type, status: 'True' }]))).toBe('success');
    }
  );

  it('warns about a group that has not been scheduled', () => {
    expect(
      getStatus(podGroup([{ type: POD_GROUP_INITIALLY_SCHEDULED_CONDITION, status: 'False' }]))
    ).toBe('warning');
  });

  it('warns about a group that has no scheduling condition yet', () => {
    expect(getStatus(podGroup())).toBe('warning');
    expect(getStatus(podGroup([{ type: 'SomethingElse', status: 'True' }]))).toBe('warning');
  });

  it('surfaces the status on the graph node, so unscheduled groups can be filtered', () => {
    const unscheduled = podGroup([
      { type: POD_GROUP_INITIALLY_SCHEDULED_CONDITION, status: 'False' },
    ]);

    expect(getGraphNodeStatus({ kubeObject: unscheduled })).toBe('warning');
    expect(getGraphNodeStatus({ kubeObject: unscheduled, status: 'success' })).toBe('success');
  });
});
