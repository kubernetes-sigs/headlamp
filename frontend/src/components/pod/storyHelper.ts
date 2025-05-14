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

import { KubePod } from '../../lib/k8s/pod';

const creationTimestamp = new Date('2022-01-01').toISOString();
const stateDate = new Date(new Date(creationTimestamp).getTime() + 1000 * 60 * 5).toISOString();

const basePod = {
  kind: 'Pod',
  apiVersion: 'v1',
  metadata: {
    name: 'base-pod',
    namespace: 'default',
    uid: '123',
    resourceVersion: '123',
    creationTimestamp,
  },
  spec: {
    containers: [],
    restartPolicy: 'Always',
    terminationGracePeriodSeconds: 30,
    nodeName: 'my-node',
    dnsPolicy: 'ClusterFirst',
    serviceAccountName: 'default',
    serviceAccount: 'default',
    securityContext: {},
    schedulerName: 'default-scheduler',
    tolerations: [
      {
        key: 'node.kubernetes.io/not-ready',
        operator: 'Exists',
        effect: 'NoExecute',
        tolerationSeconds: 300,
      },
      {
        key: 'node.kubernetes.io/unreachable',
        operator: 'Exists',
        effect: 'NoExecute',
        tolerationSeconds: 300,
      },
    ],
  },
  status: {
    phase: '',
    conditions: [],
    hostIP: '0.0.0.1',
    podIP: '0.0.0.2',
    podIPs: [
      {
        ip: '0.0.0.2',
      },
    ],
    startTime: stateDate,
    containerStatuses: [],
  },
} as KubePod;

const imgPullBackOff = {
  ...basePod,
  metadata: {
    ...basePod.metadata,
    name: 'imagepullbackoff',
    uid: '124',
  },
  spec: {
    ...basePod.spec,
    containers: [
      {
        name: 'imagepullbackoff',
        image: 'doesnotexist:nover',
        imagePullPolicy: 'IfNotPresent',
      },
    ],
  },
  status: {
    ...basePod.status,
    phase: 'Pending',
    conditions: [
      {
        type: 'Initialized',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
      {
        type: 'Ready',
        status: 'False',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
        reason: 'ContainersNotReady',
        message: 'containers with unready status: [imagepullbackoff]',
      },
      {
        type: 'ContainersReady',
        status: 'False',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
        reason: 'ContainersNotReady',
        message: 'containers with unready status: [imagepullbackoff]',
      },
      {
        type: 'PodScheduled',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
    ],
    containerStatuses: [
      {
        name: 'imagepullbackoff',
        state: {
          waiting: {
            reason: 'ImagePullBackOff',
            message: 'Back-off pulling image "doesnotexist:nover"',
          },
        },
        lastState: {
          terminated: {
            exitCode: 1,
            reason: 'ImagePullBackOff',
            message: 'Back-off pulling image "doesnotexist:nover"',
            startedAt: stateDate,
            finishedAt: stateDate,
            containerID: '1234abcd',
          },
        },
        ready: false,
        restartCount: 1,
        image: 'doesnotexist:nover',
        imageID: '',
        started: false,
      },
    ],
  },
};

const successful = {
  ...basePod,
  metadata: {
    ...basePod.metadata,
    name: 'successful',
    uid: '125',
  },
  spec: {
    ...basePod.spec,
    containers: [
      {
        name: 'successful',
        image: 'alpine:3.4',
        command: ['/bin/sh', '-c', 'echo Succeeded'],
        imagePullPolicy: 'IfNotPresent',
      },
    ],
    restartPolicy: 'Never',
  },
  status: {
    startTime: stateDate,
    phase: 'Succeeded',
    conditions: [
      {
        type: 'Initialized',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
        reason: 'PodCompleted',
      },
      {
        type: 'Ready',
        status: 'False',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
        reason: 'PodCompleted',
      },
      {
        type: 'ContainersReady',
        status: 'False',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
        reason: 'PodCompleted',
      },
      {
        type: 'PodScheduled',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
    ],
    containerStatuses: [
      {
        name: 'successful',
        state: {
          terminated: {
            exitCode: 0,
            reason: 'Completed',
            startedAt: stateDate,
            finishedAt: stateDate,
            containerID:
              'containerd://d64ce854c96f53b2aaa00a975d026ffe5d7b862370a95abe88f2c033e01ae843',
          },
        },
        lastState: {},
        ready: false,
        restartCount: 0,
        image: 'docker.io/library/alpine:3.4',
        imageID:
          'docker.io/library/alpine@sha256:b733d4a32c4da6a00a84df2ca32791bb03df95400243648d8c539e7b4cce329c',
        containerID:
          'containerd://d64ce854c96f53b2aaa00a975d026ffe5d7b862370a95abe88f2c033e01ae843',
        started: false,
      },
    ],
  },
};

const initializing = {
  ...basePod,
  metadata: {
    ...basePod.metadata,
    name: 'initializing',
    uid: '125',
  },
  spec: {
    ...basePod.spec,
    initContainers: [
      {
        name: 'init-myservice',
        image: 'busybox',
        command: [
          'sh',
          '-c',
          'until nslookup myservice; do echo waiting for myservice; sleep 2; done;',
        ],
        imagePullPolicy: 'Always',
      },
      {
        name: 'init-mydb',
        image: 'busybox',
        command: ['sh', '-c', 'until nslookup mydb; do echo waiting for mydb; sleep 2; done;'],
        imagePullPolicy: 'Always',
      },
    ],
    containers: [
      {
        name: 'myapp-container',
        image: 'busybox',
        command: ['sh', '-c', 'echo The app is running! && sleep 3600'],
        imagePullPolicy: 'Always',
      },
    ],
  },
  status: {
    ...basePod.status,
    phase: 'Pending',
    conditions: [
      {
        type: 'Initialized',
        status: 'False',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
        reason: 'ContainersNotInitialized',
        message: 'containers with incomplete status: [init-myservice init-mydb]',
      },
      {
        type: 'Ready',
        status: 'False',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
        reason: 'ContainersNotReady',
        message: 'containers with unready status: [myapp-container]',
      },
      {
        type: 'ContainersReady',
        status: 'False',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
        reason: 'ContainersNotReady',
        message: 'containers with unready status: [myapp-container]',
      },
      {
        type: 'PodScheduled',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
    ],
    initContainerStatuses: [
      {
        name: 'init-myservice',
        state: {
          running: {
            startedAt: stateDate,
          },
        },
        lastState: {},
        ready: false,
        restartCount: 0,
        image: 'docker.io/library/busybox:latest',
        imageID:
          'docker.io/library/busybox@sha256:125113b35efe765c89a8ed49593e719532318d26828c58e26b26dd7c4c28a673',
        containerID:
          'containerd://5fd564933040cc489ad0774b3f4d99866547cfef02a5277d7459a0fc800c9307',
      },
      {
        name: 'init-mydb',
        state: {
          waiting: {
            reason: 'PodInitializing',
          },
        },
        lastState: {},
        ready: false,
        restartCount: 0,
        image: 'busybox',
        imageID: '',
      },
    ],
    containerStatuses: [
      {
        name: 'myapp-container',
        state: {
          waiting: {
            reason: 'PodInitializing',
          },
        },
        lastState: {},
        ready: false,
        restartCount: 0,
        image: 'busybox',
        imageID: '',
        started: false,
      },
    ],
  },
};

const livenessFailed = {
  ...basePod,
  metadata: {
    ...basePod.metadata,
    name: 'liveness-http',
    uid: '126',
  },
  spec: {
    ...basePod.spec,
    containers: [
      {
        name: 'liveness',
        image: 'registry.k8s.io/liveness',
        args: ['/server'],
        resources: {},
        livenessProbe: {
          httpGet: {
            path: '/healthz',
            port: 8080,
            scheme: 'HTTP',
            httpHeaders: [
              {
                name: 'Custom-Header',
                value: 'Awesome',
              },
            ],
          },
          initialDelaySeconds: 3,
          timeoutSeconds: 1,
          periodSeconds: 3,
          successThreshold: 1,
          failureThreshold: 3,
        },
        terminationMessagePath: '/dev/termination-log',
        terminationMessagePolicy: 'File',
        imagePullPolicy: 'Always',
      },
    ],
  },
  status: {
    ...basePod.status,
    phase: 'Running',
    conditions: [
      {
        type: 'Initialized',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
      {
        type: 'Ready',
        status: 'False',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
        reason: 'ContainersNotReady',
        message: 'containers with unready status: [liveness]',
      },
      {
        type: 'ContainersReady',
        status: 'False',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
        reason: 'ContainersNotReady',
        message: 'containers with unready status: [liveness]',
      },
      {
        type: 'PodScheduled',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
    ],
    containerStatuses: [
      {
        name: 'liveness',
        state: {
          waiting: {
            reason: 'CrashLoopBackOff',
            message:
              'back-off 5m0s restarting failed container=liveness pod=liveness-http_default(4f8b71a3-f99c-41c2-9523-83edc1de02ce)',
          },
        },
        lastState: {
          terminated: {
            exitCode: 2,
            reason: 'Error',
            startedAt: stateDate,
            finishedAt: stateDate,
            containerID:
              'containerd://29f9695acc1968213087b71914dde17337b142aa63603113a4d03feabba1514c',
          },
        },
        ready: false,
        restartCount: 337,
        image: 'registry.k8s.io/liveness:latest',
        imageID: 'sha256:554cfcf2aa85635c0b1ae9506f36f50118419766221651e70dfdc94631317b4d',
        containerID:
          'containerd://29f9695acc1968213087b71914dde17337b142aa63603113a4d03feabba1514c',
        started: false,
      },
    ],
  },
};

const errorTerminated = {
  ...basePod,
  metadata: {
    ...basePod.metadata,
    name: 'terminated',
    uid: '127',
  },
  spec: {
    ...basePod.spec,
    containers: [
      {
        name: 'terminated',
        image: 'alpine:3.4',
        command: ['/bin/sh', '-c', 'exit 1'],
        resources: {},
        imagePullPolicy: 'IfNotPresent',
      },
    ],
    restartPolicy: 'Never',
  },
  status: {
    ...basePod.status,
    phase: 'Failed',
    conditions: [
      {
        type: 'Initialized',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
      {
        type: 'Ready',
        status: 'False',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
        reason: 'PodFailed',
      },
      {
        type: 'ContainersReady',
        status: 'False',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
        reason: 'PodFailed',
      },
      {
        type: 'PodScheduled',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
    ],
    containerStatuses: [
      {
        name: 'terminated',
        state: {
          terminated: {
            exitCode: 1,
            reason: 'Error',
            startedAt: stateDate,
            finishedAt: stateDate,
            containerID:
              'containerd://007cdc266ae70e22e73a077c1c31b71b6c407b3f3817c84da10608dd3b7a82bd',
          },
        },
        lastState: {},
        ready: false,
        restartCount: 0,
        image: 'docker.io/library/alpine:3.4',
        imageID:
          'docker.io/library/alpine@sha256:b733d4a32c4da6a00a84df2ca32791bb03df95400243648d8c539e7b4cce329c',
        containerID:
          'containerd://007cdc266ae70e22e73a077c1c31b71b6c407b3f3817c84da10608dd3b7a82bd',
        started: false,
      },
    ],
  },
};

const running = {
  ...basePod,
  metadata: {
    ...basePod.metadata,
    name: 'running',
    uid: '128',
  },
  spec: {
    ...basePod.spec,
    containers: [
      {
        name: 'nginx',
        image: 'nginx:1.14.2',
        ports: [
          {
            containerPort: 80,
            protocol: 'TCP',
          },
        ],
        imagePullPolicy: 'IfNotPresent',
      },
    ],
  },
  status: {
    ...basePod.status,
    phase: 'Running',
    conditions: [
      {
        type: 'Initialized',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
      {
        type: 'Ready',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
      {
        type: 'ContainersReady',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
      {
        type: 'PodScheduled',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
    ],
    containerStatuses: [
      {
        name: 'nginx',
        state: {
          running: {
            startedAt: stateDate,
          },
        },
        lastState: {},
        ready: true,
        restartCount: 0,
        image: 'docker.io/library/nginx:1.14.2',
        imageID:
          'docker.io/library/nginx@sha256:f7988fb6c02e0ce69257d9bd9cf37ae20a60f1df7563c3a2a6abe24160306b8d',
        containerID:
          'containerd://f8eb12a25a065d170b68cee522d431f4920fe083bf9cf53a4a576d60b8641584',
        started: true,
      },
    ],
  },
};

const nominatedNode = {
  ...basePod,
  metadata: {
    ...basePod.metadata,
    name: 'nominated-node',
    uid: '129',
  },
  spec: {
    ...basePod.spec,
    containers: [
      {
        name: 'nginx',
        image: 'nginx:1.14.2',
        ports: [
          {
            containerPort: 80,
            protocol: 'TCP',
          },
        ],
        imagePullPolicy: 'IfNotPresent',
      },
    ],
  },
  status: {
    ...basePod.status,
    nominatedNodeName: 'my-node',
    phase: 'Running',
    conditions: [
      {
        type: 'Initialized',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
      {
        type: 'Ready',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
      {
        type: 'ContainersReady',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
      {
        type: 'PodScheduled',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
    ],
    containerStatuses: [
      {
        name: 'nginx',
        state: {
          running: {
            startedAt: stateDate,
          },
        },
        lastState: {},
        ready: true,
        restartCount: 0,
        image: 'docker.io/library/nginx:1.14.2',
        imageID:
          'docker.io/library/nginx@sha256:f7988fb6c02e0ce69257d9bd9cf37ae20a60f1df7563c3a2a6abe24160306b8d',
        containerID:
          'containerd://f8eb12a25a065d170b68cee522d431f4920fe083bf9cf53a4a576d60b8641584',
        started: true,
      },
    ],
  },
};

const readinessGate = {
  ...basePod,
  metadata: {
    ...basePod.metadata,
    name: 'readiness-gate',
    uid: '130',
  },
  spec: {
    ...basePod.spec,
    containers: [
      {
        name: 'nginx',
        image: 'nginx:1.14.2',
        ports: [
          {
            containerPort: 80,
            protocol: 'TCP',
          },
        ],
        imagePullPolicy: 'IfNotPresent',
      },
    ],
    readinessGates: [
      {
        conditionType: 'www.example.com/gate-1',
      },
    ],
  },
  status: {
    ...basePod.status,
    phase: 'Running',
    conditions: [
      {
        lastProbeTime: null,
        lastTransitionTime: null,
        status: 'True',
        type: 'www.example.com/gate-1',
      },
      {
        type: 'Initialized',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
      {
        type: 'Ready',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
      {
        type: 'ContainersReady',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
      {
        type: 'PodScheduled',
        status: 'True',
        lastProbeTime: null,
        lastTransitionTime: stateDate,
      },
    ],
    containerStatuses: [
      {
        name: 'nginx',
        state: {
          running: {
            startedAt: stateDate,
          },
        },
        lastState: {},
        ready: true,
        restartCount: 0,
        image: 'docker.io/library/nginx:1.14.2',
        imageID:
          'docker.io/library/nginx@sha256:f7988fb6c02e0ce69257d9bd9cf37ae20a60f1df7563c3a2a6abe24160306b8d',
        containerID:
          'containerd://f8eb12a25a065d170b68cee522d431f4920fe083bf9cf53a4a576d60b8641584',
        started: true,
      },
    ],
  },
};

// Exporting so these can be used for details views
export const podList: KubePod[] = [
  imgPullBackOff,
  successful,
  initializing,
  livenessFailed,
  errorTerminated,
  running,
  nominatedNode,
  readinessGate,
];
