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

import type { ClusterPreOpenHook } from '../redux/clusterProviderSlice';

const preOpenHooks: ClusterPreOpenHook[] = [];
const privateApply = Reflect.apply;
const privatePush = Array.prototype.push;
const PrivatePromise = Promise;
const privatePromiseResolve = Promise.resolve;
const privateThen = Promise.prototype.then;
const privateAddEventListener = EventTarget.prototype.addEventListener;
const privateRemoveEventListener = EventTarget.prototype.removeEventListener;
const privateStructuredClone = structuredClone;

/** Settles when the hook settles or preparation is aborted, whichever happens first. */
function runHookUntilAbort(
  hook: ClusterPreOpenHook,
  context: Parameters<ClusterPreOpenHook>[0]
): Promise<void> {
  const signal = context.signal;
  if (!signal) {
    return hook(context);
  }
  if (signal.aborted) {
    return new PrivatePromise((_resolve, reject) =>
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    );
  }

  return new PrivatePromise<void>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    privateApply(privateAddEventListener, signal, ['abort', onAbort, { once: true }]);
    const hookPromise = privateApply(privatePromiseResolve, PrivatePromise, [hook(context)]);
    privateApply(privateThen, hookPromise, [
      () => {
        privateApply(privateRemoveEventListener, signal, ['abort', onAbort]);
        resolve();
      },
      (error: unknown) => {
        privateApply(privateRemoveEventListener, signal, ['abort', onAbort]);
        reject(error);
      },
    ]);
  });
}

/** Registers a privileged callback outside renderer-visible Redux state. */
export function registerClusterPreOpenHook(hook: ClusterPreOpenHook): void {
  privateApply(privatePush, preOpenHooks, [hook]);
}

/** Returns whether callbacks are registered without exposing them. */
export function hasClusterPreOpenHooks(): boolean {
  return preOpenHooks.length > 0;
}

/** Runs callbacks by index so mutable global iterators cannot observe them. */
export async function runClusterPreOpenHooks(
  context: Parameters<ClusterPreOpenHook>[0],
  beforeEach: () => void
): Promise<void> {
  const hookCount = preOpenHooks.length;
  for (let index = 0; index < hookCount; index += 1) {
    beforeEach();
    await runHookUntilAbort(preOpenHooks[index], {
      cluster: context.cluster,
      clusterConf: privateStructuredClone(context.clusterConf),
      reportProgress: context.reportProgress,
      signal: context.signal,
    });
  }
}

/** Clears module state between isolated tests. */
export function resetClusterPreOpenHooksForTests(): void {
  preOpenHooks.length = 0;
}
