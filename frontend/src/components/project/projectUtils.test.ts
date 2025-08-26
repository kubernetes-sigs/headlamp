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
import DaemonSet from '../../lib/k8s/daemonSet';
import Deployment from '../../lib/k8s/deployment';
import Pod from '../../lib/k8s/pod';
import StatefulSet from '../../lib/k8s/statefulSet';
import { getHealthIcon, getResourcesByKind, getResourcesHealth } from './projectUtils';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeDeployment(params: {
  name: string;
  namespace?: string;
  replicas?: number;
  readyReplicas?: number;
  labels?: Record<string, string>;
  cluster?: string;
}) {
  const {
    name,
    namespace = 'default',
    replicas = 1,
    readyReplicas = 1,
    labels = {},
    cluster,
  } = params;
  return new Deployment(
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name, namespace, uid: uid(name), labels },
      spec: { replicas, template: { spec: { containers: [] as any, nodeName: '' } } } as any,
      status: { readyReplicas } as any,
    } as any,
    cluster
  );
}

function makeStatefulSet(params: {
  name: string;
  namespace?: string;
  replicas?: number;
  readyReplicas?: number;
  labels?: Record<string, string>;
  cluster?: string;
}) {
  const {
    name,
    namespace = 'default',
    replicas = 1,
    readyReplicas = 1,
    labels = {},
    cluster,
  } = params;
  return new StatefulSet(
    {
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: { name, namespace, uid: uid(name), labels },
      spec: { replicas, template: { spec: { containers: [] as any, nodeName: '' } } } as any,
      status: { readyReplicas } as any,
    } as any,
    cluster
  );
}

function makeDaemonSet(params: {
  name: string;
  namespace?: string;
  numberReady?: number;
  desiredNumberScheduled?: number;
  labels?: Record<string, string>;
  cluster?: string;
}) {
  const {
    name,
    namespace = 'default',
    numberReady = 1,
    desiredNumberScheduled = 1,
    labels = {},
    cluster,
  } = params;
  return new DaemonSet(
    {
      apiVersion: 'apps/v1',
      kind: 'DaemonSet',
      metadata: { name, namespace, uid: uid(name), labels },
      spec: {} as any,
      status: { numberReady, desiredNumberScheduled } as any,
    } as any,
    cluster
  );
}

function makePod(params: {
  name: string;
  namespace?: string;
  phase?: string;
  ready?: boolean;
  labels?: Record<string, string>;
  cluster?: string;
}) {
  const {
    name,
    namespace = 'default',
    phase = 'Running',
    ready = true,
    labels = {},
    cluster,
  } = params;
  return new Pod(
    {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name, namespace, uid: uid(name), labels },
      spec: { containers: [] as any, nodeName: '' },
      status: {
        phase,
        conditions: [{ type: 'Ready', status: ready ? 'True' : 'False' }],
        containerStatuses: [],
        startTime: new Date().toISOString() as any,
      },
    } as any,
    cluster
  );
}

describe('getHealthIcon', () => {
  it('returns help icon when total is 0', () => {
    expect(getHealthIcon(0, 0, 0)).toBe('mdi:help-circle');
  });
  it('returns error icon when unhealthy > 0', () => {
    expect(getHealthIcon(0, 1, 0)).toBe('mdi:alert-circle');
  });
  it('returns warning icon when warning > 0 and unhealthy = 0', () => {
    expect(getHealthIcon(0, 0, 1)).toBe('mdi:alert');
  });
  it('returns success icon otherwise', () => {
    expect(getHealthIcon(1, 0, 0)).toBe('mdi:check-circle');
  });
});

describe('getResourcesByKind', () => {
  it('filters by kind', () => {
    const d1 = makeDeployment({ name: 'd1' });
    const d2 = makeDeployment({ name: 'd2' });
    const p1 = makePod({ name: 'p1' });
    const res = getResourcesByKind([d1, d2, p1], 'Deployment');
    expect(res).toHaveLength(2);
    expect(res.every(r => r.kind === 'Deployment')).toBe(true);
  });
});

describe('getProjectHealth', () => {
  it('computes healthy/warning/unhealthy correctly across kinds', () => {
    const depHealthy = makeDeployment({ name: 'dep-ok', replicas: 3, readyReplicas: 3 });
    const ssWarn = makeStatefulSet({ name: 'ss-bad', replicas: 2, readyReplicas: 0 });
    const dsWarn = makeDaemonSet({ name: 'ds-warn', numberReady: 1, desiredNumberScheduled: 3 });
    const podHealthy = makePod({ name: 'pod-ok', phase: 'Running', ready: true });
    const podWarn = makePod({ name: 'pod-pending', phase: 'Pending', ready: false });
    const podUnhealthy = makePod({ name: 'pod-bad', phase: 'Failed', ready: false });

    const { success, warning, error } = getResourcesHealth([
      depHealthy,
      ssWarn,
      dsWarn,
      podHealthy,
      podWarn,
      podUnhealthy,
    ]);

    expect({ success, warning, error }).toEqual({
      success: 2,
      warning: 3,
      error: 1,
    });
  });
});
