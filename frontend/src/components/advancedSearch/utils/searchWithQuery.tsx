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

import jsep from 'jsep';
import evaluate from 'simple-eval';
import { getTopLevelKeys } from './getTopLevelKeys';

/**
 * Performs an asynchronous search on a collection of items using a custom query function.
 * The search process can be interrupted by setting the interruptRef to true.
 *
 * @param {any[]} items - The array of items to search through. Each item is expected to have a jsonData property.
 * @param {string} query - A string expression that will be converted into a query function. This should be a valid JavaScript expression that returns a boolean.
 * @param {Object} interruptRef - A ref object with a `current` property that can be set to true to interrupt the search.
 */
export async function searchWithQuery<T extends { jsonData: any }>(
  items: T[],
  query: string,
  interruptRef: { current: boolean }
): Promise<{ results: T[]; searchTimeMs: number }> {
  const searchTimeStart = performance.now();
  const results: any[] = [];

  let filterExpression: any;
  const functionBody = query;
  try {
    filterExpression = jsep(functionBody);
  } catch (e) {}

  if (!filterExpression) return { results: [], searchTimeMs: 0 };

  const batchSize = 5000;

  // Create object that contains all keys of all objects
  const dummyObject: any = {};
  getTopLevelKeys(items.map(it => it.jsonData)).forEach(key => (dummyObject[key] = undefined));

  for (let i = 0; i < items.length; i++) {
    const resource = items[i];
    const data = resource.jsonData;

    try {
      const res = evaluate(filterExpression, { ...dummyObject, ...data });
      if (res === true) {
        results.push(resource);
      }
    } catch (e) {}

    // After processing a batch or at the end, yield to the event loop
    if ((i + 1) % batchSize === 0 || i === items.length - 1) {
      // Give the browser a chance to handle other events (like clicks)
      await new Promise(resolve => setTimeout(resolve, 0));
      // Check interrupt again *after* yielding
      if (interruptRef.current) {
        return { results: [], searchTimeMs: 0 };
      }
    }
  }

  const searchTimeEnd = performance.now();

  const searchTimeMs = searchTimeEnd - searchTimeStart;

  return { results, searchTimeMs };
}
