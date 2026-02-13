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

/** Transform stream that splits text into lines */
export const makeLineSplitStream = () => {
  let leftover = '';
  return new TransformStream<string, string>({
    transform(chunk, out) {
      const parts = (leftover + chunk).split('\n');
      leftover = parts.pop() || '';
      for (const l of parts) out.enqueue(l);
    },
    flush(out) {
      if (leftover) out.enqueue(leftover);
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
