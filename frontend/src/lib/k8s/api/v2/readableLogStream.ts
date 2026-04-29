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

import { clusterFetch } from './fetch';
import { makeUrl } from './makeUrl';

/**
 * Strips a single trailing '\r' from a line so that CRLF-terminated input
 * (e.g. logs originating from Windows producers or container runtimes that
 * preserve '\r') is normalized to LF. Mid-line '\r' characters are preserved
 * since they may be intentional (progress bars, carriage-return overwrites).
 */
const stripTrailingCR = (line: string) =>
  line.length > 0 && line.charCodeAt(line.length - 1) === 13 ? line.slice(0, -1) : line;

/** Transform stream that splits text into lines. */
export const makeLineSplitStream = () => {
  let leftover = '';
  return new TransformStream<string, string>({
    transform(chunk, out) {
      const parts = (leftover + chunk).split('\n');
      leftover = parts.pop() || '';
      for (const l of parts) out.enqueue(stripTrailingCR(l));
    },
    flush(out) {
      if (leftover) out.enqueue(stripTrailingCR(leftover));
    },
  });
};

/** Transform stream that will batch items for given amount of time */
export const makeBatchingStream = (signal: AbortSignal, bufferTimeMs: number = 500) => {
  const buffer: string[] = [];
  let interval: number | undefined;

  signal.addEventListener('abort', () => clearInterval(interval), { once: true });

  return new TransformStream<string, string[]>({
    start(controller) {
      interval = window.setInterval(() => {
        if (!buffer.length) return;

        try {
          controller.enqueue([...buffer]);
        } catch (e) {
          clearInterval(interval);
        }
        buffer.length = 0;
      }, bufferTimeMs);
    },
    transform(chunk) {
      buffer.push(chunk);
    },
    flush(out) {
      clearInterval(interval);
      if (buffer.length) out.enqueue([...buffer]);
    },
  });
};

/** Readable stream that emits buffered log lines for given Pod */
export const makeReadableLogStream = async ({
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
  /** Container name */
  container: string;
  /** Number of lines to fetch. If none provided will fetch all of them */
  lines?: number;
  /** Show the logs for the previous instance of the container in a pod if it exists */
  previous: boolean;
}) => {
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
};
