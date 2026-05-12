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
  it('summarizes pod status, failed conditions, container restarts, and warning events', () => {
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
        'Condition Ready is False',
        'Container gadget is waiting: CrashLoopBackOff',
        'Container gadget restarted 3 times',
        'Previous logs may be available for restarted containers',
        'Warning event: BackOff (5 times)',
      ])
    );
    expect(diagnostics.find(item => item.id === 'container-restarted-Container-gadget')).toEqual(
      expect.objectContaining({
        references: expect.arrayContaining([
          expect.objectContaining({
            label: 'View current or previous logs',
            search: { view: 'logs' },
          }),
        ]),
      })
    );
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
});
