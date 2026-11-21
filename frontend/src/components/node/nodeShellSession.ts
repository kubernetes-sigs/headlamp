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

import { apply } from '../../lib/k8s/api/v1/apply';
import { clusterRequest } from '../../lib/k8s/api/v1/clusterRequests';
import type { StreamResultsCb } from '../../lib/k8s/api/v1/streamingApi';
import { stream } from '../../lib/k8s/api/v1/streamingApi';
import type { KubeJob } from '../../lib/k8s/job';

export const NODE_SHELL_JOB_ACTIVE_DEADLINE_SECONDS = 60 * 60;
export const NODE_SHELL_JOB_TTL_SECONDS = 60;

const NODE_SHELL_POD_DISCOVERY_TIMEOUT_MS = 30_000;
const NODE_SHELL_POD_DISCOVERY_INTERVAL_MS = 250;
const NODE_SHELL_POD_LABEL = 'headlamp.dev/node-shell-job';

interface NodeShellPodStatus {
  phase?: string;
  reason?: string;
  message?: string;
  containerStatuses?: Array<{
    name: string;
    state?: { running?: unknown };
  }>;
}

interface NodeShellPodListResponse {
  items?: Array<{
    metadata?: { name?: string };
    status?: NodeShellPodStatus;
  }>;
}

export interface NodeShellSession {
  stream: ReturnType<typeof stream>;
  cleanup: () => Promise<void>;
}

function uniqueString() {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';
  let result = '';

  for (let i = 0; i < 5; i++) {
    const index = Math.floor(Math.random() * alphabet.length);
    result += alphabet[index];
  }

  return result;
}

function nodeShellJobName(nodeName: string) {
  const nodeNamePart = nodeName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36);

  return `node-debugger-${nodeNamePart || 'node'}-${uniqueString()}`;
}

export function createNodeShellJob(
  name: string,
  namespace: string,
  nodeName: string,
  nodeShellImage: string
): KubeJob {
  return {
    kind: 'Job',
    apiVersion: 'batch/v1',
    metadata: { name, namespace },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: NODE_SHELL_JOB_ACTIVE_DEADLINE_SECONDS,
      ttlSecondsAfterFinished: NODE_SHELL_JOB_TTL_SECONDS,
      template: {
        metadata: {
          labels: { [NODE_SHELL_POD_LABEL]: name },
        },
        spec: {
          nodeName,
          restartPolicy: 'Never',
          terminationGracePeriodSeconds: 30,
          hostPID: true,
          hostIPC: true,
          hostNetwork: true,
          tolerations: [{ operator: 'Exists' }],
          containers: [
            {
              name: 'debugger',
              image: nodeShellImage,
              command: ['sh'],
              terminationMessagePolicy: 'File',
              tty: true,
              stdin: true,
              stdinOnce: true,
              volumeMounts: [{ mountPath: '/host', name: 'host-root' }],
            },
          ],
          volumes: [
            {
              name: 'host-root',
              hostPath: { path: '/', type: 'Directory' },
            },
          ],
        },
      },
    },
  } as unknown as KubeJob;
}

async function waitForNodeShellPod(jobName: string, namespace: string, cluster: string) {
  const deadline = Date.now() + NODE_SHELL_POD_DISCOVERY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const response = (await clusterRequest(
      `/api/v1/namespaces/${namespace}/pods`,
      { method: 'GET', cluster },
      { labelSelector: `${NODE_SHELL_POD_LABEL}=${jobName}` }
    )) as NodeShellPodListResponse;
    const pod = response.items?.[0];

    if (pod?.status?.phase === 'Failed' || pod?.status?.phase === 'Succeeded') {
      throw new Error(
        pod.status.message ||
          pod.status.reason ||
          `Node shell pod ${pod.status.phase.toLowerCase()}`
      );
    }

    if (
      pod?.status?.phase === 'Running' &&
      pod.status.containerStatuses?.some(
        container => container.name === 'debugger' && !!container.state?.running
      ) &&
      pod.metadata?.name
    ) {
      return pod.metadata.name;
    }

    await new Promise(resolve => setTimeout(resolve, NODE_SHELL_POD_DISCOVERY_INTERVAL_MS));
  }

  throw new Error('Timed out waiting for the node shell pod to start');
}

/**
 * Creates a TTL-managed Job for a node shell and attaches to its running Pod.
 *
 * @param nodeName - Name of the node to debug.
 * @param cluster - Cluster that owns the node.
 * @param namespace - Namespace in which to create the Job.
 * @param image - Linux image used by the debugger container.
 * @param onData - Callback for terminal stream data.
 * @param onConnectionFailure - Called when the attach stream fails.
 * @param onCleanupError - Called when the Job cannot be deleted.
 * @returns The terminal stream and an idempotent Job cleanup function.
 */
export async function createNodeShellSession(
  nodeName: string,
  cluster: string,
  namespace: string,
  image: string,
  onData: StreamResultsCb,
  onConnectionFailure: () => void,
  onCleanupError: (error: unknown) => void
): Promise<NodeShellSession> {
  const name = nodeShellJobName(nodeName);
  let jobCreated = false;
  let cleanupPromise: Promise<void> | null = null;

  const cleanup = () => {
    if (!jobCreated) {
      return Promise.resolve();
    }

    if (!cleanupPromise) {
      cleanupPromise = Promise.resolve()
        .then(() =>
          clusterRequest(
            `/apis/batch/v1/namespaces/${namespace}/jobs/${name}?propagationPolicy=Background`,
            { method: 'DELETE', cluster }
          )
        )
        .then(() => undefined)
        .catch(error => {
          if ((error as { status?: number })?.status === 404) {
            return;
          }
          cleanupPromise = null;
          throw error;
        });
    }

    return cleanupPromise;
  };

  try {
    const appliedJob = await apply(createNodeShellJob(name, namespace, nodeName, image), cluster);
    jobCreated = true;
    if (!appliedJob.metadata?.name) {
      throw new Error('Kubernetes did not return the created node shell Job name');
    }
    const podName = await waitForNodeShellPod(name, namespace, cluster);
    const url = `/api/v1/namespaces/${namespace}/pods/${podName}/attach?container=debugger&stdin=1&stderr=1&stdout=1&tty=1`;
    const additionalProtocols = [
      'v4.channel.k8s.io',
      'v3.channel.k8s.io',
      'v2.channel.k8s.io',
      'channel.k8s.io',
    ];
    const terminalStream = stream(url, onData, {
      cluster,
      additionalProtocols,
      isJson: false,
      reconnectOnFailure: false,
      failCb: () => {
        if (cleanupPromise) {
          return;
        }

        onConnectionFailure();
        void cleanup().catch(onCleanupError);
      },
    });

    return { stream: terminalStream, cleanup };
  } catch (error) {
    if (jobCreated) {
      try {
        await cleanup();
      } catch (cleanupError) {
        onCleanupError(cleanupError);
      }
    }

    throw error;
  }
}
