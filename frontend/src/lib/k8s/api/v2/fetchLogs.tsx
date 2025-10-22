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

import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { labelSelectorToQuery } from '../..';
import { ApiError } from '../../apiProxy';
import type Deployment from '../../deployment';
import Pod from '../../pod';
import type ReplicaSet from '../../replicaSet';
import { clusterFetch } from './fetch';
import { makeUrl } from './makeUrl';

function fetchLogs({
  podName,
  namespace,
  cluster,
  container,
  lines,
  onLogs: setLogs,
  onError,
}: {
  podName: string;
  namespace: string;
  cluster: string;
  container: string;
  lines: number;
  onLogs: Dispatch<SetStateAction<string[]>>;
  onError: Dispatch<SetStateAction<ApiError | undefined>>;
}) {
  let isCurrent = true;
  const url = makeUrl(`/api/v1/namespaces/${namespace}/pods/${podName}/log`, {
    container,
    follow: 'true',
    timestamps: 'true',
    tailLines: String(lines),
  });

  let buffer: string[] = [];
  const intervalId = setInterval(() => {
    if (buffer.length) {
      const bufferCopy = [...buffer];
      setLogs(l => [...l, ...bufferCopy]);
      buffer = [];
    }
  }, 500);

  async function request() {
    try {
      const response = await clusterFetch(url, { cluster });

      if (!response) return;

      let leftover = '';
      const stream = response.body!.pipeThrough(new TextDecoderStream()).pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            const lines = (leftover + chunk).split('\n');
            leftover = lines.pop() || ''; // keep last partial line
            for (const line of lines) {
              if (line) controller.enqueue(line);
            }
          },
          flush(controller) {
            if (leftover) controller.enqueue(leftover);
          },
        })
      );

      const reader = stream.getReader();
      while (isCurrent) {
        const { value, done } = await reader.read();
        if (done) return;

        buffer.push(value);
      }
    } catch (e) {
      onError(e as ApiError);
      return;
    }
  }

  setLogs([]);
  request();

  return () => {
    isCurrent = false;
    clearInterval(intervalId);
  };
}

/**
 * Fetch and watch logs for all pods in this deployment
 *
 * @param params.item - Deployment
 * @param params.container - Container name
 * @param params.lines - Amount of lines to fetch
 * @returns
 */
export const useDeploymentLogs = ({
  item,
  lines,
  container,
}: {
  item: Deployment | ReplicaSet;
  container: string;
  lines: number;
}) => {
  const { items: pods, isLoading } = Pod.useList({
    cluster: item.cluster,
    labelSelector: labelSelectorToQuery(item.jsonData.spec.selector!),
  });

  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<ApiError>();

  useEffect(() => {
    if (isLoading || !pods) return;

    const cleanups = pods.map(pod =>
      fetchLogs({
        cluster: pod.cluster,
        podName: pod.metadata.name,
        namespace: pod.metadata.namespace!,
        container,
        lines,
        onLogs: (newValue: string[] | ((old: string[]) => string[])) =>
          setLogs(oldLogs => ({
            ...oldLogs,
            [pod.metadata.name]:
              typeof newValue === 'function' ? newValue(oldLogs[pod.metadata.name]) : newValue,
          })),
        onError: setError,
      })
    );

    return () => {
      cleanups.forEach(cb => cb());
    };
  }, [isLoading, pods, lines, container]);

  return { logs, error };
};

/**
 * Fetch and watch logs for a given pod
 *
 * @param params.item - Pod instance
 * @param params.container - Container name
 * @param params.lines - Amount of lines to fetch
 * @returns
 */
export const usePodLogs = ({
  item,
  container,
  lines,
}: {
  item: Pod;
  container: string;
  lines: number;
}) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<ApiError>();

  useEffect(
    () =>
      fetchLogs({
        podName: item.metadata.name,
        namespace: item.metadata.namespace!,
        cluster: item.cluster,
        container,
        lines,
        onLogs: setLogs,
        onError: setError,
      }),
    [item, container, lines]
  );

  return { logs, error };
};
