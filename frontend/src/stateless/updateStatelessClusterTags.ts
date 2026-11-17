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

import * as yaml from 'js-yaml';
import { decodeBase64, encodeBase64 } from '../helpers/base64';
import type { ClusterTags } from '../helpers/clusterTags';
import type { KubeconfigObject } from '../lib/k8s/kubeconfig';
import { findMatchingContexts } from '.';

/** Returns the updated kubeconfig after commit, or null if this is not a stateless context. */
export function updateStatelessClusterTags(
  clusterName: string,
  tags: ClusterTags,
  clusterID?: string,
  expectedServer?: string,
  expectedAuthType?: string
): Promise<string | null> {
  return accessStatelessClusterTags(clusterName, tags, clusterID, expectedServer, expectedAuthType);
}

/** Reads the uniquely owned document, validating the same identity used by tag writes. */
export function readStatelessClusterTagTarget(
  clusterName: string,
  clusterID?: string,
  expectedServer?: string,
  expectedAuthType?: string
): Promise<string | null> {
  return accessStatelessClusterTags(
    clusterName,
    undefined,
    clusterID,
    expectedServer,
    expectedAuthType
  );
}

function accessStatelessClusterTags(
  clusterName: string,
  tags: ClusterTags | undefined,
  clusterID?: string,
  expectedServer?: string,
  expectedAuthType?: string
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('kubeconfigs', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('kubeconfigStore', { keyPath: 'id', autoIncrement: true });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(
        'kubeconfigStore',
        tags === undefined ? 'readonly' : 'readwrite'
      );
      let updated: string | null = null;
      let target: {
        entry: { kubeconfig: string };
        key: IDBValidKey;
        config: KubeconfigObject;
        context: KubeconfigObject['contexts'][number]['context'];
      } | null = null;
      transaction.oncomplete = () => {
        db.close();
        resolve(updated);
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error ?? new Error('Failed to save cluster tags'));
      };
      const objectStore = transaction.objectStore('kubeconfigStore');
      const cursorRequest = objectStore.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        try {
          if (!cursor) {
            if (target) {
              const { entry, key, config, context } = target;
              if (tags === undefined) {
                updated = entry.kubeconfig;
                return;
              }
              context.extensions ??= [];
              const existing = context.extensions.find(
                extension => extension.name === 'headlamp_info'
              );
              if (existing) {
                existing.extension = { ...existing.extension, tags };
              } else {
                context.extensions.push({ name: 'headlamp_info', extension: { tags } });
              }
              updated = encodeBase64(yaml.dump(config));
              const value = { ...entry, kubeconfig: updated };
              if (objectStore.keyPath === null) {
                objectStore.put(value, key);
              } else {
                objectStore.put(value);
              }
            }
            return;
          }
          const entry: { kubeconfig: string } = cursor.value;
          const config = yaml.load(decodeBase64(entry.kubeconfig)) as KubeconfigObject;
          const { matchingKubeconfig } = clusterID
            ? findMatchingContexts(clusterName, config, clusterID)
            : {};
          const matchingContexts = !clusterID
            ? config.contexts.filter(entry => {
                const customName = entry.context.extensions?.find(
                  extension => extension.name === 'headlamp_info'
                )?.extension.customName;
                const displayName =
                  customName || entry.name.replace(/\//g, '--').replace(/ /g, '__');
                return displayName === clusterName;
              })
            : [];
          if (matchingContexts.length > 1) {
            throw new Error('Ambiguous browser kubeconfig context');
          }
          const context = (matchingKubeconfig ?? matchingContexts[0])?.context;
          if (!context) {
            cursor.continue();
            return;
          }
          if (target) {
            throw new Error('Ambiguous browser kubeconfig context');
          }
          if (
            expectedServer !== undefined &&
            config.clusters.find(entry => entry.name === context.cluster)?.cluster.server !==
              expectedServer
          ) {
            throw new Error('Browser kubeconfig context was replaced');
          }
          const user = config.users?.find(entry => entry.name === context.user)?.user;
          const authProvider =
            user && ('auth-provider' in user ? user['auth-provider'] : user.authProvider);
          if (expectedAuthType !== undefined && (authProvider ? 'oidc' : '') !== expectedAuthType) {
            throw new Error('Browser kubeconfig authentication was replaced');
          }
          target = { entry, key: cursor.primaryKey, config, context };
          cursor.continue();
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      };
    };
  });
}
