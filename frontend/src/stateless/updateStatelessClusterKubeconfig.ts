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

import * as jsyaml from 'js-yaml';
import { KubeconfigObject } from '../lib/k8s/kubeconfig';
import {
  CursorSuccessEvent,
  DatabaseErrorEvent,
  DatabaseEvent,
  findMatchingContexts,
  handleDataBaseError,
  handleDatabaseUpgrade,
} from '.';

/**
 * Update the kubeconfig context extensions in IndexedDB.
 * @param kubeconfig - The kubeconfig to store.
 * @param customName - The custom name for the context extension.
 * @param clusterName - The name of the cluster to update the kubeconfig context for.
 * @returns promise that resolves when the kubeconfig is successfully updated and stored.
 * @throws Error if IndexedDB is not supported.
 * @throws Error if the kubeconfig is invalid.
 */

export function updateStatelessClusterKubeconfig(
  kubeconfig: string,
  customName: string,
  clusterName: string
): Promise<void> {
  return new Promise<void>(async (resolve, reject) => {
    try {
      const request = indexedDB.open('kubeconfigs', 1) as any;
      request.onupgradeneeded = handleDatabaseUpgrade;

      // scan each row until we find the context with the clusterName
      request.onsuccess = function handleDatabaseSuccess(event: DatabaseEvent) {
        const db = event.target.result;

        if (!db) {
          reject('Failed to open IndexedDB');
          return;
        }

        const transaction = db.transaction(['kubeconfigStore'], 'readwrite');
        const store = transaction.objectStore('kubeconfigStore');

        // variable to track if we found and updated the context
        let updated = false;

        store.openCursor().onsuccess = function onCursor(event: Event) {
          const e = event as CursorSuccessEvent;
          const cursor = e.target?.result;

          if (!cursor) {
            if (!updated) {
              reject(`Cluster with name ${clusterName} not found`);
            }
            return;
          }

          const row = cursor.value;
          const rowKubeconfig64 = row.kubeconfig;
          const parsed = jsyaml.load(atob(rowKubeconfig64)) as KubeconfigObject;

          const { matchingKubeconfig, matchingContext } = findMatchingContexts(clusterName, parsed);

          // if no matching kubeconfig or context, continue to next cursor
          if (!matchingKubeconfig && !matchingContext) {
            cursor.continue();
            return;
          }

          // we found a matching context or kubeconfig, update it
          const target = matchingContext ?? matchingKubeconfig!;
          const extensions = target.context.extensions || [];

          let headlampExtensions = extensions.find(ext => ext.name === 'headlamp_info');

          if (!headlampExtensions) {
            headlampExtensions = { name: 'headlamp_info', extension: { customName } as any };
            extensions.push(headlampExtensions);
          } else {
            // we overwrite the new customName
            headlampExtensions.extension = { ...headlampExtensions.extension, customName };
          }

          target.context.extensions = extensions;

          // now we need to modify the yaml back into this row only
          const updatedKubeconfig = btoa(jsyaml.dump(parsed));
          const updatedRow = { ...row, kubeconfig: updatedKubeconfig };

          const putRequest = store.put(updatedRow);

          putRequest.onsuccess = () => {
            updated = true;
            resolve();
          };

          putRequest.onerror = (err: any) => {
            reject(`Failed to update kubeconfig: ${err.target.error}`);
          };

          store.openCursor().onerror = function onCursorError(event: Event) {
            const de = event as DatabaseErrorEvent;
            reject(de.target ? de.target.error : 'Error during the cursor operation');
          };
        };
      };

      // The onerror event is fired when the database is opened.
      // This is where you handle errors
      request.onerror = handleDataBaseError;
    } catch (error) {
      reject(error);
    }
  });
}
