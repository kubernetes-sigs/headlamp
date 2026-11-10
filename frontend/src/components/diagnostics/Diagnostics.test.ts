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

vi.mock('../../lib/k8s/event', () => ({
  default: class Event {
    static objectEvents = vi.fn();
  },
  __esModule: true,
}));

vi.mock('../../lib/k8s/pod', () => ({
  default: class Pod {
    static useList = vi.fn(() => ({ items: [], errors: [] }));
  },
  __esModule: true,
}));

vi.mock('../common/Link', () => ({
  default: ({ children }: any) => children,
  __esModule: true,
}));

import { getPodDiagnostics, getWorkloadDiagnostics } from './Diagnostics';

function makePod(overrides: any = {}) {
  const pod = {
    kind: 'Pod',
    metadata: {
      name: 'gadget-7g7s2',
      namespace: 'gadget',
      uid: 'pod-1',
      resourceVersion: '1',
    },
    spec: {
      containers: [{ name: 'gadget', image: 'gadget:latest' }],
    },
    status: {
      phase: 'Running',
      conditions: [
        {
          type: 'Ready',
          status: 'False',
          reason: 'ContainersNotReady',
          message: 'containers with unready status: [gadget]',
        },
      ],
      containerStatuses: [
        {
          name: 'gadget',
          state: {
            waiting: {
              reason: 'CrashLoopBackOff',
              message: 'back-off restarting failed container',
            },
          },
          lastState: {
            terminated: {
              exitCode: 1,
              reason: 'Error',
              message: 'container exited',
              finishedAt: '2026-05-09T05:30:00Z',
            },
          },
          ready: false,
          restartCount: 3,
          image: 'gadget:latest',
          imageID: '',
        },
      ],
    },
    cluster: 'minikube',
    getDetailedStatus: () => ({
      reason: 'CrashLoopBackOff',
      message: 'back-off restarting failed container',
      readyContainers: 0,
      totalContainers: 1,
      restarts: 3,
    }),
    ...overrides,
  };

  return pod as any;
}

describe('diagnostics helpers', () => {
  it('summarizes pod status, failed conditions, and warning events without duplicating container state', () => {
    const diagnostics = getPodDiagnostics(makePod(), [
      {
        type: 'Warning',
        reason: 'BackOff',
        message: 'Back-off restarting failed container gadget',
        count: 5,
        lastTimestamp: '2026-05-09T05:31:00Z',
        firstTimestamp: '2026-05-09T05:20:00Z',
        metadata: { uid: 'event-1' },
      } as any,
    ]);

    expect(diagnostics.map(item => item.title)).toEqual(
      expect.arrayContaining([
        'Pod status: CrashLoopBackOff',
        'Previous logs may be available for restarted containers',
        'Warning event: BackOff (5 times)',
      ])
    );
    // Per-container findings are intentionally omitted (shown in the Containers
    // section); the restarted-containers hint is still surfaced.
    expect(diagnostics.some(item => item.id.startsWith('container-'))).toBe(false);
    // Conditions that only restate the failure (reason ContainersNotReady) are
    // dropped as circular rather than shown.
    expect(diagnostics.some(item => item.id.startsWith('condition-'))).toBe(false);
    expect(diagnostics.some(item => item.id === 'pod-previous-logs')).toBe(true);
    // Logs are opened from a single header action, not per-item links.
    expect(diagnostics.every(item => !item.references)).toBe(true);
  });

  it('keeps informative conditions and adds a diagnosis hint when the message is missing', () => {
    const pod = makePod({
      status: {
        phase: 'Pending',
        conditions: [{ type: 'PodScheduled', status: 'False', reason: 'Unschedulable' }],
        containerStatuses: [],
      },
      getDetailedStatus: () => ({
        reason: 'Pending',
        message: '',
        readyContainers: 0,
        totalContainers: 1,
        restarts: 0,
      }),
    });

    const diagnostics = getPodDiagnostics(pod, []);
    const scheduled = diagnostics.find(item => item.id === 'condition-PodScheduled');
    expect(scheduled?.title).toBe('Condition PodScheduled is False');
    expect(scheduled?.message).toMatch(/scheduler could not place the pod/i);
    // The failing PodScheduled condition must not also produce a duplicate
    // scheduling hint from getPendingHints.
    expect(diagnostics.some(item => item.id === 'pod-scheduling-condition')).toBe(false);
  });

  it('aggregates unhealthy workload pods by dominant reason', () => {
    const crashLoopPod = makePod();
    const imagePullPod = makePod({
      metadata: { name: 'web-1', namespace: 'default', uid: 'pod-2', resourceVersion: '1' },
      status: {
        ...makePod().status,
        phase: 'Pending',
        containerStatuses: [
          {
            name: 'web',
            state: { waiting: { reason: 'ImagePullBackOff' } },
            lastState: {},
            ready: false,
            restartCount: 0,
            image: 'bad:image',
            imageID: '',
          },
        ],
      },
      getDetailedStatus: () => ({
        reason: 'ImagePullBackOff',
        message: '',
        readyContainers: 0,
        totalContainers: 1,
        restarts: 0,
      }),
    });
    const secondImagePullPod = makePod({
      metadata: { name: 'web-2', namespace: 'default', uid: 'pod-3', resourceVersion: '1' },
      status: imagePullPod.status,
      getDetailedStatus: imagePullPod.getDetailedStatus,
    });
    const workload = {
      kind: 'Deployment',
      metadata: { name: 'web', namespace: 'default' },
      spec: { replicas: 3 },
      status: { readyReplicas: 0, availableReplicas: 0, unavailableReplicas: 3 },
    } as any;

    const diagnostics = getWorkloadDiagnostics(workload, [
      crashLoopPod,
      imagePullPod,
      secondImagePullPod,
    ]);

    expect(diagnostics.map(item => item.title)).toEqual(
      expect.arrayContaining([
        'Deployment has unavailable replicas',
        '2 pods are failing with ImagePullBackOff',
        '1 pod is failing with CrashLoopBackOff',
      ])
    );
  });

  it('surfaces ReplicaFailure=True controller condition when ReplicaSet is blocked by quota with no pods', () => {
    const replicaSet = {
      kind: 'ReplicaSet',
      metadata: {
        name: 'quota-blocked',
        namespace: 'headlamp-diagnostics-repro',
      },
      spec: {
        replicas: 1,
      },
      status: {
        replicas: 0,
        observedGeneration: 1,
        conditions: [
          {
            type: 'ReplicaFailure',
            status: 'True',
            reason: 'FailedCreate',
            message:
              'pods "quota-blocked-hqj5l" is forbidden: exceeded quota: no-pods, requested: pods=1, used: pods=0, limited: pods=0',
          },
        ],
      },
    } as any;

    const diagnostics = getWorkloadDiagnostics(replicaSet, []);

    const failureItem = diagnostics.find(item => item.id === 'workload-condition-ReplicaFailure');
    expect(failureItem).toBeDefined();
    expect(failureItem?.severity).toBe('error');
    expect(failureItem?.title).toBe('ReplicaSet condition ReplicaFailure is True');
    expect(failureItem?.message).toBe(
      'pods "quota-blocked-hqj5l" is forbidden: exceeded quota: no-pods, requested: pods=1, used: pods=0, limited: pods=0'
    );
    expect(failureItem?.details).toEqual(['Reason: FailedCreate']);
  });

  it('surfaces ReplicaFailure=True condition for Deployments', () => {
    const deployment = {
      kind: 'Deployment',
      metadata: { name: 'web-deploy', namespace: 'default' },
      spec: { replicas: 2 },
      status: {
        replicas: 0,
        conditions: [
          {
            type: 'ReplicaFailure',
            status: 'True',
            reason: 'FailedCreate',
            message: 'Cannot create pods',
          },
        ],
      },
    } as any;

    const diagnostics = getWorkloadDiagnostics(deployment, []);
    const failureItem = diagnostics.find(item => item.id === 'workload-condition-ReplicaFailure');
    expect(failureItem).toBeDefined();
    expect(failureItem?.severity).toBe('error');
    expect(failureItem?.title).toBe('Deployment condition ReplicaFailure is True');
    expect(failureItem?.message).toBe('Cannot create pods');
  });

  // Defensive semantics test: Kubernetes controllers typically remove ReplicaFailure
  // upon recovery rather than keeping it with status=False, but if present False must
  // never be flagged as a failure.
  it('does not create a failure finding when ReplicaFailure is False', () => {
    const replicaSet = {
      kind: 'ReplicaSet',
      metadata: { name: 'recovered-rs', namespace: 'default' },
      spec: { replicas: 1 },
      status: {
        replicas: 1,
        availableReplicas: 1,
        readyReplicas: 1,
        conditions: [
          {
            type: 'ReplicaFailure',
            status: 'False',
            reason: 'ReplicaSetCreateSuccessful',
          },
        ],
      },
    } as any;

    const diagnostics = getWorkloadDiagnostics(replicaSet, []);
    expect(diagnostics.some(item => item.id.includes('ReplicaFailure'))).toBe(false);
  });

  it.each([
    { type: 'Available', status: 'True', expectedSeverity: null },
    { type: 'Progressing', status: 'True', expectedSeverity: null },
    { type: 'Available', status: 'False', expectedSeverity: 'error' },
    { type: 'Progressing', status: 'False', expectedSeverity: 'error' },
    { type: 'Available', status: 'Unknown', expectedSeverity: 'warning' },
    { type: 'ReplicaFailure', status: 'Unknown', expectedSeverity: 'warning' },
  ])(
    'evaluates condition $type with status $status as severity $expectedSeverity',
    ({ type, status, expectedSeverity }) => {
      const workload = {
        kind: 'Deployment',
        metadata: { name: 'app', namespace: 'default' },
        spec: { replicas: 1 },
        status: {
          replicas: 1,
          availableReplicas: 1,
          readyReplicas: 1,
          conditions: [{ type, status, reason: 'TestReason', message: `Test message for ${type}` }],
        },
      } as any;

      const diagnostics = getWorkloadDiagnostics(workload, []);
      const conditionDiagnostic = diagnostics.find(
        item => item.id === `workload-condition-${type}`
      );

      if (expectedSeverity === null) {
        expect(conditionDiagnostic).toBeUndefined();
      } else {
        expect(conditionDiagnostic).toBeDefined();
        expect(conditionDiagnostic?.severity).toBe(expectedSeverity);
      }
    }
  );
});
