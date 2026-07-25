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

import { KubeObject } from '../../../lib/k8s/KubeObject';

export function fetchLatestKubeObject<K extends KubeObject>(item: K): Promise<K> {
  return new Promise((resolve, reject) => {
    let cancel: (() => void) | undefined;
    let cancelScheduled = false;
    let settled = false;

    function scheduleCancel() {
      if (!cancel || cancelScheduled) {
        return;
      }

      cancelScheduled = true;
      // Defer cancellation so streamResult can finish initializing its watch socket.
      queueMicrotask(() => cancel?.());
    }

    function resolveOnce(latestItem: KubeObject) {
      if (settled) {
        return;
      }

      settled = true;
      latestItem.cluster = item.cluster;
      scheduleCancel();
      resolve(latestItem as K);
    }

    function rejectOnce(err: unknown) {
      if (settled) {
        return;
      }

      settled = true;
      scheduleCancel();
      reject(err);
    }

    const request = item
      ._class()
      .apiGet(resolveOnce, item.getName(), item.getNamespace(), rejectOnce, {
        cluster: item.cluster,
      });

    request()
      .then(cancelFn => {
        cancel = cancelFn;
        if (settled) {
          scheduleCancel();
        }
      })
      .catch(rejectOnce);
  });
}
