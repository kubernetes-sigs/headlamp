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

import { useEffect, useMemo, useState } from 'react';
import { labelSelectorToQuery } from '../..';
import type { ApiError } from '../../apiProxy';
import type DaemonSet from '../../daemonSet';
import type Deployment from '../../deployment';
import Job from '../../job';
import Pod from '../../pod';
import type ReplicaSet from '../../replicaSet';
import type StatefulSet from '../../statefulSet';
import { makeReadableLogStream } from './readableLogStream';

export interface LogParams {
  /** Container name */
  container: string;
  /** Number of lines to fetch. If none provided will fetch all of them */
  lines?: number;
  /** Show the logs for the previous instance of the container in a pod if it exists */
  previous: boolean;
  /** Fetch logs from this workload */
  item: Pod | Deployment | ReplicaSet | DaemonSet | StatefulSet | Job;
}

/**
 * Fetch and watch logs for all pods in this workload
 *
 * @param params - Named params
 * @returns logs and error (if any)
 */
export const useWorkloadLogs = ({ item, lines, container, previous }: LogParams) => {
  let labelSelector: string | undefined = undefined;

  if ('selector' in item.jsonData.spec && item.jsonData.spec.selector) {
    labelSelector = labelSelectorToQuery(item.jsonData.spec.selector);
  } else if (Job.isClassOf(item)) {
    labelSelector = `batch.kubernetes.io/job-name=${item.metadata.name}`;
  }

  // Fetch all pods for the given workload, if item is not a Pod
  const { items: workloadPods, isLoading } = Pod.useList({
    isEnabled: item.kind !== 'Pod' && !!labelSelector,
    cluster: item.cluster,
    namespace: item.metadata.namespace,
    labelSelector,
  });

  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<ApiError>();

  const pods = useMemo(
    () => (item.kind === 'Pod' ? [item as Pod] : workloadPods),
    [item, workloadPods]
  );

  useEffect(() => {
    if (isLoading || !pods) return;

    // One abort controller for all streams
    const controller = new AbortController();

    // Legit case of syncing external source
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLogs({});
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(undefined);

    // For each pod create a log stream
    pods.forEach(pod =>
      makeReadableLogStream({
        podName: pod.metadata.name,
        namespace: pod.metadata.namespace!,
        cluster: pod.cluster,
        container,
        lines,
        previous,
        signal: controller.signal,
      })
        .then(stream =>
          stream.pipeTo(
            // Put all new logs into state
            new WritableStream({
              write(chunk) {
                setLogs(oldLogs => ({
                  ...oldLogs,
                  [pod.metadata.name]: [...(oldLogs[pod.metadata.name] ?? []), ...chunk],
                }));
              },
            })
          )
        )
        .catch(e => {
          // We aborted it so we don't care about this error
          if (e.name === 'AbortError') return;

          // Cleanup and show error to user
          controller.abort();
          setError(e as ApiError);
        })
    );

    return () => {
      controller.abort();
    };
  }, [isLoading, pods, lines, container, previous]);

  return { logs, error };
};
