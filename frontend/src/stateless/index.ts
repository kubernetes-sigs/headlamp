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
import _ from 'lodash';
import { request } from '../lib/k8s/apiProxy';
import { Cluster } from '../lib/k8s/cluster';
import { KubeconfigObject } from '../lib/k8s/kubeconfig';
import { ConfigState, setStatelessConfig } from '../redux/configSlice';
import store from '../redux/stores/store';

/**
 * ParsedConfig is the object that is fetched from the backend.
 * It has cluster information as keys. The values are the same as the KubeconfigObject.
 * @see KubeconfigObject
 * @see fetchStatelessClusterKubeConfigs
 */
interface ParsedConfig {
  [prop: string]: Cluster[];
}

/**
 * DatabaseEvent is the event that is fired when the IndexedDB is upgraded.
 * It is used to create the object store. It is also used to get the result of the
 * IndexedDB open request. The result is the IndexedDB database. It is used to create
 * the transaction and the object store. It is also used to get the result of the
 * IndexedDB add request. The result is the key of the added object.
 * @see storeStatelessClusterKubeconfig
 * @see getStatelessClusterKubeConfigs
 * @see findKubeconfigByClusterName
 */
interface DatabaseEvent extends Event {
  // target is the request that generated the event.
  target: IDBOpenDBRequest & {
    // result is the IndexedDB database. It is used to create the transaction and the object store.
    result: IDBDatabase;
  };
}

/**
 * DatabaseErrorEvent is the event that is fired when the IndexedDB is upgraded.
 * It is used to get the error of the IndexedDB open request. It is also used to get
 * the error of the IndexedDB add request.
 * @see storeStatelessClusterKubeconfig
 * @see getStatelessClusterKubeConfigs
 * @see findKubeconfigByClusterName
 */
interface DatabaseErrorEvent extends Event {
  // target is the request that generated the event.
  target: IDBOpenDBRequest & {
    // error is the error of the request.
    error: DOMException | null;
  };
}

/**
 * CursorSuccessEvent is the event that is fired when the IndexedDB is upgraded.
 * It is used to get the result of the IndexedDB open request. The result is the
 * cursor. It is used to iterate through the object store. It is also used to get
 * the result of the IndexedDB add request. The result is the cursor. It is used to
 * iterate through the object store.
 * @see getStatelessClusterKubeConfigs
 * @see findKubeconfigByClusterName
 * */
interface CursorSuccessEvent extends Event {
  // target is the request that generated the event.
  target: EventTarget & {
    // result is the cursor. It is used to iterate through the object store.
    result: IDBCursorWithValue | null;
  };
}

/** handleDatabaseUpgrade creates the object store if it doesn't exist.
 * this upgrade is only called when the database is created.
 * It is not called when the database is opened.
 * @param event - The event that is fired when the IndexedDB is upgraded.
 * @see storeStatelessClusterKubeconfig
 * @see getStatelessClusterKubeConfigs
 * @see findKubeconfigByClusterName
 * **/
function handleDatabaseUpgrade(event: DatabaseEvent) {
  const db = event.target ? event.target.result : null;
  // Create the object store if it doesn't exist
  if (db && !db.objectStoreNames.contains('kubeconfigStore')) {
    db.createObjectStore('kubeconfigStore', { keyPath: 'id', autoIncrement: true });
  }
}

/** handleDataBaseError handles errors when opening IndexedDB.
 * @param event - The event that is fired when the IndexedDB is upgraded.
 * @see storeStatelessClusterKubeconfig
 * @see getStatelessClusterKubeConfigs
 * @see findKubeconfigByClusterName
 * */

function handleDataBaseError(event: DatabaseErrorEvent, reject: (reason?: any) => void) {
  console.error(event.target ? event.target.error : 'An error occurred while opening IndexedDB');
  reject(event.target ? event.target.error : 'An error occurred while opening IndexedDB');
}

/**
 * Store the kubeconfig for a stateless cluster in IndexedDB.
 * @param kubeconfig - The kubeconfig to store.
 * @returns promise that resolves when the kubeconfig is successfully added.
 * @throws Error if IndexedDB is not supported.
 * @throws Error if the kubeconfig is invalid.
 */
export function storeStatelessClusterKubeconfig(kubeconfig: string): Promise<void> {
  return new Promise<void>(async (resolve, reject) => {
    const request = indexedDB.open('kubeconfigs', 1) as any;

    // The onupgradeneeded event is fired when the database is created for the first time.
    request.onupgradeneeded = handleDatabaseUpgrade;

    /** The onsuccess event is fired when the database is opened.
     * This event is where you specify the actions to take when the database is opened.
     * Once the database is opened, it creates a transaction and an object store.
     * The transaction is used to add the kubeconfig to the object store.
     * The object store is used to store the kubeconfig.
     * */
    request.onsuccess = function handleDatabaseSuccess(event: DatabaseEvent) {
      const db = event.target ? event.target.result : null;

      if (db) {
        const transaction = db.transaction(['kubeconfigStore'], 'readwrite');
        const store = transaction.objectStore('kubeconfigStore');

        const newItem = { kubeconfig: kubeconfig };
        const addRequest = store.add(newItem);

        // The onsuccess event is fired when the request has succeeded.
        // This is where you handle the results of the request.
        addRequest.onsuccess = function requestSuccess() {
          console.log('Kubeconfig added to IndexedDB');
          resolve(); // Resolve the promise when the kubeconfig is successfully added
        };

        // The onerror event is fired when the request has failed.
        // This is where you handle the error.
        addRequest.onerror = function requestError(event: Event) {
          const errorEvent = event as DatabaseErrorEvent;
          console.error(errorEvent.target ? errorEvent.target.error : 'An error occurred');
          reject(errorEvent.target ? errorEvent.target.error : 'An error occurred'); // Reject the promise on error
        };
      } else {
        console.error('Failed to open IndexedDB');
        reject('Failed to open IndexedDB');
      }
    };

    // The onerror event is fired when the database is opened.
    // This is where you handle errors.
    request.onerror = handleDataBaseError;
  });
}

/**
 * Gets stateless cluster kubeconfigs from IndexedDB.
 * @returns A promise that resolves with the kubeconfigs.
 * @throws Error if IndexedDB is not supported.
 * @throws Error if the kubeconfig is invalid.
 */
export function getStatelessClusterKubeConfigs(): Promise<string[]> {
  return new Promise<string[]>(async (resolve, reject) => {
    const request = indexedDB.open('kubeconfigs', 1) as any;

    // The onupgradeneeded event is fired when the database is created for the first time.
    request.onupgradeneeded = handleDatabaseUpgrade;

    /** The onsuccess event is fired when the database is opened.
     * This event is where you specify the actions to take when the database is opened.
     * Once the database is opened, it creates a transaction and an object store.
     * It returns all the kubeconfigs from the object store.
     * */
    request.onsuccess = function handleDatabaseSuccess(event: DatabaseEvent) {
      const db = event.target ? event.target.result : null;

      if (db) {
        const transaction = db.transaction(['kubeconfigStore'], 'readonly');
        const store = transaction.objectStore('kubeconfigStore');

        const kubeconfigs: string[] = [];

        /** The onsuccess event is fired when the request has succeeded.
         * This is where you handle the results of the request.
         * The result is the cursor. It is used to iterate through the object store.
         * The cursor is null when there are no more objects to iterate through.
         * */
        store.openCursor().onsuccess = function storeSuccess(event: Event) {
          const successEvent = event as CursorSuccessEvent;
          const cursor = successEvent.target.result;
          if (cursor) {
            kubeconfigs.push(cursor.value.kubeconfig);
            cursor.continue();
          } else {
            // All kubeconfigs have been retrieved
            resolve(kubeconfigs);
          }
        };
      } else {
        reject('Failed to open IndexedDB');
      }
    };

    // The onerror event is fired when the database is opened.
    // This is where you handle errors.
    request.onerror = handleDataBaseError;
  });
}

/**
 * Finds a kubeconfig by cluster name.
 * @param clusterName
 * @returns A promise that resolves with the kubeconfig, or null if not found.
 * @throws Error if IndexedDB is not supported.
 * @throws Error if the kubeconfig is invalid.
 */
export function findKubeconfigByClusterName(clusterName: string): Promise<string | null> {
  return new Promise<string | null>(async (resolve, reject) => {
    try {
      const request = indexedDB.open('kubeconfigs', 1) as any;

      // The onupgradeneeded event is fired when the database is created for the first time.
      request.onupgradeneeded = handleDatabaseUpgrade;

      // The onsuccess event is fired when the database is opened.
      // This event is where you specify the actions to take when the database is opened.
      request.onsuccess = function handleDatabaseSuccess(event: DatabaseEvent) {
        const db = event.target.result;
        const transaction = db.transaction(['kubeconfigStore'], 'readonly');
        const store = transaction.objectStore('kubeconfigStore');

        // The onsuccess event is fired when the request has succeeded.
        // This is where you handle the results of the request.
        // The result is the cursor. It is used to iterate through the object store.
        // The cursor is null when there are no more objects to iterate through.
        // The cursor is used to find the kubeconfig by cluster name.
        store.openCursor().onsuccess = function storeSuccess(event: Event) {
          const successEvent = event as CursorSuccessEvent;
          const cursor = successEvent.target.result;
          if (cursor) {
            const kubeconfigObject = cursor.value;
            const kubeconfig = kubeconfigObject.kubeconfig;

            const parsedKubeconfig = jsyaml.load(atob(kubeconfig)) as KubeconfigObject;
            // Check for "headlamp_info" in extensions
            const matchingContext = parsedKubeconfig.contexts.find(
              context =>
                context.context.extensions?.find(extension => extension.name === 'headlamp_info')
                  ?.extension.customName === clusterName
            );

            const matchingKubeconfig = parsedKubeconfig.contexts.find(
              context => context.name === clusterName
            );

            if (matchingKubeconfig || matchingContext) {
              resolve(kubeconfig);
            } else {
              cursor.continue();
            }
          } else {
            resolve(null); // No matching kubeconfig found
          }
        };
      };

      // The onerror event is fired when the database is opened.
      // This is where you handle errors.
      request.onerror = handleDataBaseError;
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * In the backend we use a unique ID to identify a user. If there is no ID in localStorage
 * we generate a new one and store it in localStorage. We then combine it with the
 * cluster name and this headlamp-userId to create a unique ID for a cluster. If we don't
 * do it then if 2 different users have a cluster with the same name, then the
 * proxy will be overwritten.
 * @returns headlamp-userId from localStorage
 */
export function getUserIdFromLocalStorage(): string {
  let headlampUserId = localStorage.getItem('headlamp-userId');

  if (!headlampUserId) {
    headlampUserId = generateSecureToken();

    if (headlampUserId) {
      localStorage.setItem('headlamp-userId', headlampUserId);
    }
  }

  return headlampUserId!;
}

/**
 * Generates a cryptographically secure random token using the browser's crypto API.
 * @param {number} length - The length of the token.
 * @returns {string} - The generated token.
 */
function generateSecureToken(length = 16): string {
  const buffer = new Uint8Array(length);
  if (import.meta.env.NODE_ENV === 'test') {
    // Use Math.random() in the testing environment
    return Array.from(buffer, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
  window.crypto.getRandomValues(buffer);
  return Array.from(buffer, byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

/**
 * Compares the cluster config from the backend and the redux store
 * @param clusters
 * @param clustersToConfig
 * @returns true if the present stored config is different from the fetched one.
 */
export function isEqualClusterConfigs(
  currentConfig: ConfigState['clusters'],
  newConfig: ConfigState['clusters']
): boolean {
  if (!currentConfig || !newConfig) {
    return true; // Config is different if either is null/undefined
  }

  const currentKeys = Object.keys(currentConfig);
  const newKeys = Object.keys(newConfig);

  if (currentKeys.length !== newKeys.length) {
    return true; // Different number of clusters
  }

  return currentKeys.some(key => {
    if (!newConfig[key]) {
      return true; // Cluster in current config doesn't exist in new config
    }
    const currentCluster = _.omit(currentConfig[key], ['useToken']);
    const newCluster = _.omit(newConfig[key], ['useToken']);
    return !_.isEqual(currentCluster, newCluster);
  });
}

/**
 * Parses the cluster config from the backend and updates the redux store
 * if the present stored config is different from the fetched one.
 */
export async function fetchStatelessClusterKubeConfigs(dispatch: any) {
  const config = await getStatelessClusterKubeConfigs();
  const statelessClusters = store.getState().config.statelessClusters;
  const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };
  const clusterReq = {
    kubeconfigs: config,
  };

  // Parses statelessCluster config
  request(
    '/parseKubeConfig',
    {
      method: 'POST',
      body: JSON.stringify(clusterReq),
      headers: {
        ...JSON_HEADERS,
      },
    },
    false,
    false
  )
    .then((config: ParsedConfig) => {
      const clustersToConfig: ConfigState['statelessClusters'] = {};
      if (config?.clusters && Array.isArray(config.clusters)) {
        config?.clusters.forEach((cluster: Cluster) => {
          clustersToConfig[cluster.name] = cluster;
        });
      }

      const configToStore = {
        statelessClusters: clustersToConfig,
      };
      if (statelessClusters === null) {
        dispatch(setStatelessConfig({ ...configToStore }));
      } else if (Object.keys(clustersToConfig).length !== Object.keys(statelessClusters).length) {
        dispatch(setStatelessConfig({ ...configToStore }));
      }
    })
    .catch((err: Error) => {
      console.error('Error getting config:', err);
    });
}

/**
 * deleteClusterKubeconfig deletes the kubeconfig for a stateless cluster from indexedDB
 * @param clusterName - The name of the cluster
 * @returns A promise that resolves with the kubeconfig, or null if not found.
 */
export async function deleteClusterKubeconfig(clusterName: string): Promise<string | null> {
  return new Promise<string | null>(async (resolve, reject) => {
    try {
      const request = indexedDB.open('kubeconfigs', 1) as any;

      // The onupgradeneeded event is fired when the database is created for the first time.
      request.onupgradeneeded = handleDatabaseUpgrade;

      // The onsuccess event is fired when the database is opened.
      // This event is where you specify the actions to take when the database is opened.
      request.onsuccess = function handleDatabaseSuccess(event: DatabaseEvent) {
        const db = event.target.result;
        const transaction = db.transaction(['kubeconfigStore'], 'readwrite');
        const store = transaction.objectStore('kubeconfigStore');

        // The onsuccess event is fired when the request has succeeded.
        // This is where you handle the results of the request.
        // The result is the cursor. It is used to iterate through the object store.
        // The cursor is null when there are no more objects to iterate through.
        // The cursor is used to find the kubeconfig by cluster name.
        store.openCursor().onsuccess = function storeSuccess(event: Event) {
          // delete the kubeconfig by cluster name
          const successEvent = event as CursorSuccessEvent;
          const cursor = successEvent.target.result;
          if (cursor) {
            const kubeconfigObject = cursor.value;
            const kubeconfig = kubeconfigObject.kubeconfig;

            const parsedKubeconfig = jsyaml.load(atob(kubeconfig)) as KubeconfigObject;
            // Find the context with the matching cluster name or custom name in headlamp_info
            const matchingKubeconfig = parsedKubeconfig.contexts.find(
              context =>
                context.name === clusterName ||
                context.context.extensions?.find(extension => extension.name === 'headlamp_info')
                  ?.extension.customName === clusterName
            );

            if (matchingKubeconfig) {
              const deleteRequest = store.delete(cursor.key);
              deleteRequest.onsuccess = () => {
                console.log('Kubeconfig deleted from IndexedDB');
                resolve(kubeconfig);
              };
              deleteRequest.onerror = () => {
                console.error('Error deleting kubeconfig from IndexedDB');
                reject('Error deleting kubeconfig from IndexedDB');
              };
            } else {
              cursor.continue();
            }
          } else {
            resolve(null); // No matching kubeconfig found
          }
        };
      };

      // The onerror event is fired when the database is opened.
      // This is where you handle errors.
      request.onerror = handleDataBaseError;
    } catch (error) {
      reject(error);
    }
  });
}

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
      // Parse the kubeconfig from base64
      const parsedKubeconfig = jsyaml.load(atob(kubeconfig)) as KubeconfigObject;
      // Find the context with the matching cluster name or custom name in headlamp_info
      const matchingContext = parsedKubeconfig.contexts.find(
        context =>
          context.name === clusterName ||
          context.context.extensions?.find(extension => extension.name === 'headlamp_info')
            ?.extension.customName === clusterName
      );

      if (matchingContext) {
        const extensions = matchingContext.context.extensions || [];
        const headlampExtension = extensions.find(extension => extension.name === 'headlamp_info');

        if (matchingContext.name === clusterName) {
          // Push the new extension if the cluster name matches
          extensions.push({
            extension: {
              customName: customName,
            },
            name: 'headlamp_info',
          });
        } else if (headlampExtension) {
          // Update the existing extension if found
          headlampExtension.extension.customName = customName;
        }

        // Ensure the extensions property is updated
        matchingContext.context.extensions = extensions;
      } else {
        console.error('No context found matching the cluster name:', clusterName);
        reject('No context found matching the cluster name');
        return;
      }

      // Convert the updated kubeconfig back to base64
      const updatedKubeconfig = btoa(jsyaml.dump(parsedKubeconfig));

      // The onupgradeneeded event is fired when the database is created for the first time.
      request.onupgradeneeded = handleDatabaseUpgrade;
      // The onsuccess event is fired when the database is opened.
      // This event is where you specify the actions to take when the database is opened.
      request.onsuccess = function handleDatabaseSuccess(event: DatabaseEvent) {
        const db = event.target.result;
        if (db) {
          const transaction = db.transaction(['kubeconfigStore'], 'readwrite');
          const store = transaction.objectStore('kubeconfigStore');

          // Get the existing kubeconfig entry by clusterName
          store.openCursor().onsuccess = function getSuccess(event: Event) {
            const successEvent = event as CursorSuccessEvent;
            const cursor = successEvent.target?.result;
            if (cursor) {
              // Update the kubeconfig entry with the new kubeconfig
              cursor.value.kubeconfig = updatedKubeconfig;
              // Put the updated kubeconfig entry back into IndexedDB
              const putRequest = store.put(cursor.value);
              // The onsuccess event is fired when the request has succeeded.
              putRequest.onsuccess = function putSuccess() {
                console.log('Updated kubeconfig with custom name and stored in IndexedDB');
                resolve(); // Resolve the promise when the kubeconfig is successfully updated and stored
              };

              // The onerror event is fired when the request has failed.
              putRequest.onerror = function putError(event: Event) {
                const errorEvent = event as DatabaseErrorEvent;
                console.error(errorEvent.target ? errorEvent.target.error : 'An error occurred');
                reject(errorEvent.target ? errorEvent.target.error : 'An error occurred');
              };
            } else {
              console.error('No kubeconfig entry found for cluster name:', clusterName);
              reject('No kubeconfig entry found for cluster name');
            }
          };

          store.openCursor().onerror = function getError(event: Event) {
            const errorEvent = event as DatabaseErrorEvent;
            console.error(errorEvent.target ? errorEvent.target.error : 'An error occurred');
            reject(errorEvent.target ? errorEvent.target.error : 'An error occurred');
          };
        } else {
          console.error('Failed to open IndexedDB');
          reject('Failed to open IndexedDB');
        }
      };

      // The onerror event is fired when the database is opened.
      // This is where you handle errors
      request.onerror = handleDataBaseError;
    } catch (error) {
      reject(error);
    }
  });
}

const exportFunctions = {
  storeStatelessClusterKubeconfig,
  getStatelessClusterKubeConfigs,
  findKubeconfigByClusterName,
  getUserIdFromLocalStorage,
  isEqualClusterConfigs,
  fetchStatelessClusterKubeConfigs,
  deleteClusterKubeconfig,
  updateStatelessClusterKubeconfig,
  // @deprecated - use isEqualClusterConfigs instead
  processClusterComparison: isEqualClusterConfigs,
};

export default exportFunctions;
