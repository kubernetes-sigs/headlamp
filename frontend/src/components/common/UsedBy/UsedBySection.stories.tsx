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

import { Meta, StoryFn } from '@storybook/react';
import { delay, http, HttpResponse } from 'msw';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { TestContext } from '../../../test';
import UsedBySection from './UsedBySection';

const NAMESPACE = 'default';
const PODS_URL = `http://localhost:4466/api/v1/namespaces/${NAMESPACE}/pods`;

function buildPod(overrides: {
  name: string;
  ownerKind?: string;
  ownerName?: string;
  spec: Record<string, any>;
}) {
  return {
    kind: 'Pod',
    apiVersion: 'v1',
    metadata: {
      name: overrides.name,
      namespace: NAMESPACE,
      uid: `uid-${overrides.name}`,
      resourceVersion: '1',
      creationTimestamp: new Date('2025-01-01').toISOString(),
      ownerReferences: overrides.ownerKind
        ? [
            {
              kind: overrides.ownerKind,
              name: overrides.ownerName ?? 'owner',
              uid: 'owner-uid',
              apiVersion: 'apps/v1',
              controller: true,
              blockOwnerDeletion: true,
            },
          ]
        : undefined,
    },
    spec: { restartPolicy: 'Always', nodeName: 'n1', ...overrides.spec },
    status: {
      phase: 'Running',
      conditions: [{ type: 'Ready', status: 'True' }],
      containerStatuses: [],
    },
  };
}

function podListResponse(items: ReturnType<typeof buildPod>[]) {
  return HttpResponse.json({
    kind: 'PodList',
    apiVersion: 'v1',
    metadata: { resourceVersion: '1' },
    items,
  });
}

const configMapResource = {
  metadata: { name: 'my-cm', namespace: NAMESPACE },
  cluster: '',
} as unknown as KubeObject;

const secretResource = {
  metadata: { name: 'my-secret', namespace: NAMESPACE },
  cluster: '',
} as unknown as KubeObject;

export default {
  title: 'Common/UsedBySection',
  component: UsedBySection,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta<typeof UsedBySection>;

const ConfigMapTemplate: StoryFn = () => (
  <UsedBySection resource={configMapResource} resourceKind="ConfigMap" />
);
const SecretTemplate: StoryFn = () => (
  <UsedBySection resource={secretResource} resourceKind="Secret" />
);

export const ConfigMapNoConsumers = ConfigMapTemplate.bind({});
ConfigMapNoConsumers.parameters = {
  msw: { handlers: { story: [http.get(PODS_URL, () => podListResponse([]))] } },
};

// Stories below render against an msw-backed Pod list. The snapshot runner reads
// the DOM before that request settles, so its snapshot would capture the
// transient empty state rather than the populated table / error these stories
// exist to demonstrate. The populated and error UIs are already covered by
// UsedBySection.test.tsx; the stories stay for visual inspection in Storybook
// but opt out of storyshots to avoid locking in misleading output. See the
// Loading story below for the same pattern.
const NON_DETERMINISTIC_STORYSHOT = { storyshots: { disable: true } };

export const ConfigMapSingleConsumer = ConfigMapTemplate.bind({});
ConfigMapSingleConsumer.parameters = {
  ...NON_DETERMINISTIC_STORYSHOT,
  msw: {
    handlers: {
      story: [
        http.get(PODS_URL, () =>
          podListResponse([
            buildPod({
              name: 'web-1',
              ownerKind: 'Deployment',
              ownerName: 'web',
              spec: {
                containers: [
                  { name: 'app', image: 'nginx', envFrom: [{ configMapRef: { name: 'my-cm' } }] },
                ],
              },
            }),
          ])
        ),
      ],
    },
  },
};

export const ConfigMapMultipleConsumersMixedUsage = ConfigMapTemplate.bind({});
ConfigMapMultipleConsumersMixedUsage.parameters = {
  ...NON_DETERMINISTIC_STORYSHOT,
  msw: {
    handlers: {
      story: [
        http.get(PODS_URL, () =>
          podListResponse([
            buildPod({
              name: 'api-1',
              ownerKind: 'ReplicaSet',
              ownerName: 'api-abc',
              spec: {
                containers: [
                  {
                    name: 'api',
                    image: 'nginx',
                    env: [
                      {
                        name: 'CFG',
                        valueFrom: { configMapKeyRef: { name: 'my-cm', key: 'config.yaml' } },
                      },
                    ],
                  },
                ],
                volumes: [{ name: 'cfg', configMap: { name: 'my-cm' } }],
              },
            }),
            buildPod({
              name: 'worker-1',
              ownerKind: 'DaemonSet',
              ownerName: 'worker',
              spec: {
                initContainers: [
                  {
                    name: 'init',
                    image: 'busybox',
                    envFrom: [{ configMapRef: { name: 'my-cm' } }],
                  },
                ],
                containers: [{ name: 'worker', image: 'busybox' }],
              },
            }),
            buildPod({
              name: 'unrelated-1',
              ownerKind: 'Deployment',
              ownerName: 'other',
              spec: { containers: [{ name: 'x', image: 'nginx' }] },
            }),
          ])
        ),
      ],
    },
  },
};

export const SecretEnvFromOnly = SecretTemplate.bind({});
SecretEnvFromOnly.parameters = {
  ...NON_DETERMINISTIC_STORYSHOT,
  msw: {
    handlers: {
      story: [
        http.get(PODS_URL, () =>
          podListResponse([
            buildPod({
              name: 'consumer',
              ownerKind: 'StatefulSet',
              ownerName: 'db',
              spec: {
                containers: [
                  { name: 'app', image: 'pg', envFrom: [{ secretRef: { name: 'my-secret' } }] },
                ],
              },
            }),
          ])
        ),
      ],
    },
  },
};

export const SecretVolumeMount = SecretTemplate.bind({});
SecretVolumeMount.parameters = {
  ...NON_DETERMINISTIC_STORYSHOT,
  msw: {
    handlers: {
      story: [
        http.get(PODS_URL, () =>
          podListResponse([
            buildPod({
              name: 'tls-server',
              ownerKind: 'Deployment',
              ownerName: 'tls',
              spec: {
                containers: [{ name: 'app', image: 'nginx' }],
                // Critical: Secret volumes use `secretName`, not `name`.
                volumes: [{ name: 'certs', secret: { secretName: 'my-secret' } }],
              },
            }),
          ])
        ),
      ],
    },
  },
};

export const SecretImagePullSecret = SecretTemplate.bind({});
SecretImagePullSecret.parameters = {
  ...NON_DETERMINISTIC_STORYSHOT,
  msw: {
    handlers: {
      story: [
        http.get(PODS_URL, () =>
          podListResponse([
            buildPod({
              name: 'private-image-pod',
              ownerKind: 'Deployment',
              ownerName: 'private',
              spec: {
                containers: [{ name: 'app', image: 'private/repo' }],
                imagePullSecrets: [{ name: 'my-secret' }],
              },
            }),
          ])
        ),
      ],
    },
  },
};

export const Loading = ConfigMapTemplate.bind({});
Loading.parameters = {
  // `delay('infinite')` keeps the request open indefinitely so a human can see
  // the in-flight loading message in Storybook. The snapshot runner would
  // instead capture the post-load empty state, so disable snapshots (same
  // reasoning as NON_DETERMINISTIC_STORYSHOT above).
  ...NON_DETERMINISTIC_STORYSHOT,
  msw: {
    handlers: {
      story: [
        http.get(PODS_URL, async () => {
          await delay('infinite');
          return podListResponse([]);
        }),
      ],
    },
  },
};

export const FetchError = ConfigMapTemplate.bind({});
FetchError.parameters = {
  ...NON_DETERMINISTIC_STORYSHOT,
  msw: {
    handlers: {
      story: [http.get(PODS_URL, () => HttpResponse.error())],
    },
  },
};
