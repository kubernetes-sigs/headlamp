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
import {
  getHealthIcon,
  getResourcesByKind,
  getResourcesHealth,
  PROJECT_ID_LABEL,
  toKubernetesName,
} from './projectUtils';

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

describe('toKubernetesName', () => {
  it('converts spaces to dashes', () => {
    expect(toKubernetesName('my project')).toBe('my-project');
  });

  it('converts to lowercase', () => {
    expect(toKubernetesName('MyProject')).toBe('myproject');
  });

  it('replaces special characters with dashes', () => {
    expect(toKubernetesName('my_project@test')).toBe('my-project-test');
  });

  it('removes leading and trailing dashes', () => {
    expect(toKubernetesName('-my-project-')).toBe('my-project');
  });

  it('collapses multiple dashes into one', () => {
    expect(toKubernetesName('my--project')).toBe('my-project');
  });

  it('handles complex names', () => {
    expect(toKubernetesName('My Test Project 123')).toBe('my-test-project-123');
  });

  it('truncates names longer than 63 characters', () => {
    const longName = 'a'.repeat(100);
    expect(toKubernetesName(longName).length).toBeLessThanOrEqual(63);
  });

  it('returns empty string for invalid names', () => {
    expect(toKubernetesName('---')).toBe('');
  });
});

describe('project name duplicate detection helper', () => {
  function buildExistingProjectNames(
    namespaces: Array<{ name: string; labels?: Record<string, string> }>
  ): Set<string> {
    const result = new Set<string>();
    for (const ns of namespaces) {
      const labelValue = ns.labels?.[PROJECT_ID_LABEL];
      if (!labelValue) {
        continue;
      }
      result.add(labelValue);
      result.add(toKubernetesName(labelValue));
    }
    return result;
  }

  it('returns empty set when no namespaces have project labels', () => {
    const namespaces = [{ name: 'default' }, { name: 'kube-system' }];
    const result = buildExistingProjectNames(namespaces);
    expect(result.size).toBe(0);
  });

  it('collects project names from namespace labels', () => {
    const namespaces = [
      { name: 'project-a-ns', labels: { [PROJECT_ID_LABEL]: 'project-a' } },
      { name: 'project-b-ns', labels: { [PROJECT_ID_LABEL]: 'project-b' } },
      { name: 'default' },
    ];
    const result = buildExistingProjectNames(namespaces);
    expect(result.has('project-a')).toBe(true);
    expect(result.has('project-b')).toBe(true);
    expect(result.has('default')).toBe(false);
  });

  it('stores both raw label and kubernetes-normalized form', () => {
    const namespaces = [{ name: 'my-project-ns', labels: { [PROJECT_ID_LABEL]: 'My Project' } }];
    const result = buildExistingProjectNames(namespaces);
    expect(result.has('My Project')).toBe(true);
    expect(result.has('my-project')).toBe(true);
  });

  it('detects duplicate when user enters existing project name', () => {
    const namespaces = [
      { name: 'existing-ns', labels: { [PROJECT_ID_LABEL]: 'existing-project' } },
    ];
    const existingProjectNames = buildExistingProjectNames(namespaces);

    const userInput = 'existing-project';
    const projectNameExists = userInput.length > 0 && existingProjectNames.has(userInput);
    expect(projectNameExists).toBe(true);
  });

  it('detects duplicate when user enters name that normalizes to existing project', () => {
    const namespaces = [{ name: 'my-project-ns', labels: { [PROJECT_ID_LABEL]: 'my-project' } }];
    const existingProjectNames = buildExistingProjectNames(namespaces);

    const userInput = 'My Project';
    const normalizedInput = toKubernetesName(userInput);
    const projectNameExists =
      normalizedInput.length > 0 && existingProjectNames.has(normalizedInput);
    expect(projectNameExists).toBe(true);
  });

  it('allows new unique project names', () => {
    const namespaces = [
      { name: 'existing-ns', labels: { [PROJECT_ID_LABEL]: 'existing-project' } },
    ];
    const existingProjectNames = buildExistingProjectNames(namespaces);

    const userInput = 'new-project';
    const projectNameExists = userInput.length > 0 && existingProjectNames.has(userInput);
    expect(projectNameExists).toBe(false);
  });

  it('returns false for empty project name', () => {
    const namespaces = [
      { name: 'existing-ns', labels: { [PROJECT_ID_LABEL]: 'existing-project' } },
    ];
    const existingProjectNames = buildExistingProjectNames(namespaces);

    const userInput = '';
    const projectNameExists = userInput.length > 0 && existingProjectNames.has(userInput);
    expect(projectNameExists).toBe(false);
  });
});
