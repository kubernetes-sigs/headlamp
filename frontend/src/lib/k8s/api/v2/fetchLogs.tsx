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

import { useEffect, useState } from 'react';
import { labelSelectorToQuery } from '../..';
import { ApiError } from '../../apiProxy';
import type DaemonSet from '../../daemonSet';
import type Deployment from '../../deployment';
import Pod from '../../pod';
import type ReplicaSet from '../../replicaSet';
import type StatefulSet from '../../statefulSet';
import { clusterFetch } from './fetch';
import { makeUrl } from './makeUrl';
import { makeBatchingStream, makeLineSplitStream } from './transformStreams';

export interface LogParams {
  /** Container name */
  container: string;
  /** Number of lines to fetch. If none provided will fetch all of them */
  lines?: number;
  /** Show the logs for the previous instance of the container in a pod if it exists */
  previous: boolean;
}

/** Readable stream that emits buffered log lines for given Pod */
export async function makePodLogsReadableStream({
  podName,
  namespace,
  cluster,
  container,
  lines,
  previous,
  signal,
}: {
  /** Name of the pod */
  podName: string;
  /** Namespace of the given pod */
  namespace: string;
  /** Cluster of the given pod */
  cluster: string;
  /** Signal to abort request */
  signal: AbortSignal;
} & LogParams) {
  // Query params for the log request
  // See more here: https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.34/#read-log-pod-v1-core
  const params: Record<string, string> = {
    container,
    follow: 'true',
    timestamps: 'true',
  };

  if (lines) params.tailLines = String(lines);
  if (previous) params.previous = 'true';

  const url = makeUrl(`/api/v1/namespaces/${namespace}/pods/${podName}/log`, params);
  const body = await clusterFetch(url, { cluster, signal }).then(it => it.body);

  if (!body) throw new Error('Body is missing from the logs request');

  return (
    body
      // bytes -> text
      .pipeThrough(new TextDecoderStream())
      // text -> lines of text
      .pipeThrough(makeLineSplitStream())
      // buffer into chunks so we don't spam too often and don't rerender as often
      .pipeThrough(makeBatchingStream(signal))
  );
}

/**
 * Fetch and watch logs for all pods in this workload
 *
 * @param params - Named params
 * @returns logs and error (if any)
 */
export const useWorkloadLogs = ({
  item,
  lines,
  container,
  previous,
}: {
  /** Fetch logs from this workload */
  item: Deployment | ReplicaSet | DaemonSet | StatefulSet;
} & LogParams) => {
  // Fetch all the logs from the given workload
  const { items: pods, isLoading } = Pod.useList({
    cluster: item.cluster,
    namespace: item.metadata.namespace,
    labelSelector: labelSelectorToQuery(item.jsonData.spec.selector!),
  });

  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<ApiError>();

  useEffect(() => {
    if (isLoading || !pods) return;

    setLogs({});
    setError(undefined);

    // One abort controller for all streams
    const controller = new AbortController();

    pods.forEach(pod =>
      makePodLogsReadableStream({
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

/**
 * Fetch and watch logs for a given pod
 *
 * @param params - Named params
 * @returns logs and error (if any)
 */
export const usePodLogs = ({
  item,
  container,
  lines,
  previous,
}: {
  /** Fetch logs from this Pod */
  item: Pod;
} & LogParams) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<ApiError>();

  useEffect(() => {
    setLogs([]);
    const controller = new AbortController();

    makePodLogsReadableStream({
      podName: item.metadata.name,
      namespace: item.metadata.namespace!,
      cluster: item.cluster,
      container,
      lines,
      previous,
      signal: controller.signal,
    })
      .then(stream =>
        stream.pipeTo(
          // Write all new logs into state
          new WritableStream({
            write(chunk) {
              setLogs(l => [...l, ...chunk]);
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
      });

    return () => {
      controller.abort();
    };
  }, [item.metadata.name, item.metadata.namespace, item.cluster, container, lines, previous]);

  return { logs, error };
};
