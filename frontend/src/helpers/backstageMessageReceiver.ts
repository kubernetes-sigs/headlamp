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

import jsyaml from 'js-yaml';
import { KubeconfigObject } from '../lib/k8s/kubeconfig';
import * as statelessFunctions from '../stateless';
import { isBackstage } from './isBackstage';

// BACKSTAGE_TOKEN_STORAGE_KEY is the key used to store the backstage token in the local storage
const BACKSTAGE_TOKEN_STORAGE_KEY = 'backstage_token';

/**
 * setBackstageToken sets the backstage token in the local storage
 *
 * @param token - the token to set
 */
function setBackstageToken(token: string) {
  localStorage.setItem(BACKSTAGE_TOKEN_STORAGE_KEY, token);
}

/**
 * getBackstageToken gets the backstage token from the local storage
 *
 * @returns the backstage token
 */
export function getBackstageToken(): string | null {
  return localStorage.getItem(BACKSTAGE_TOKEN_STORAGE_KEY);
}

/**
 * storeKubeconfigFromBackstage stores the kubeconfig from backstage as a stateless cluster kubeconfig
 *
 * @param kubeconfig - the kubeconfig to store
 */
async function storeKubeconfigFromBackstage(kubeconfig: string) {
  try {
    // Decode base64 kubeconfig
    const decodedKubeconfig = atob(kubeconfig);
    const parsedKubeconfig = jsyaml.load(decodedKubeconfig) as KubeconfigObject;

    // For each context, create a new kubeconfig
    const promises = parsedKubeconfig.contexts.map(
      async (context: { name: string; context: { cluster: string; user: string } }) => {
        // Find the corresponding cluster and auth info
        const cluster = parsedKubeconfig.clusters.find(
          (c: { name: string }) => c.name === context.context.cluster
        );
        const authInfo = parsedKubeconfig.users.find(
          (u: { name: string }) => u.name === context.context.user
        );

        if (!cluster || !authInfo) {
          console.warn(`Missing cluster or auth info for context ${context.name}`);
          return;
        }

        // Create a new kubeconfig with just this context, cluster, and auth info
        const newKubeconfig: KubeconfigObject = {
          apiVersion: parsedKubeconfig.apiVersion,
          kind: parsedKubeconfig.kind,
          preferences: parsedKubeconfig.preferences,
          'current-context': context.name,
          contexts: [context],
          clusters: [cluster],
          users: [authInfo],
        };

        // Convert back to YAML and base64 encode
        const newKubeconfigYaml = jsyaml.dump(newKubeconfig, { lineWidth: -1 });
        const newKubeconfigBase64 = btoa(newKubeconfigYaml);
        await statelessFunctions.findAndReplaceKubeconfig(context.name, newKubeconfigBase64, true);
      }
    );
    console.log('Promises', promises);
    // Wait for all kubeconfig operations to complete
    await Promise.all(promises);
  } catch (error) {
    console.error('Error storing kubeconfig from backstage:', error);
  }
}

/**
 * BackstageMessage is the interface for the message from the backstage app
 */
interface BackstageMessage {
  type: 'BACKSTAGE_AUTH_TOKEN' | 'BACKSTAGE_KUBECONFIG';
  payload?: {
    token?: string;
    kubeconfig?: string;
  };
}

const BACKSTAGE_ACK_TIMEOUT_MS = 1000;

/**
 * setupBackstageMessageReceiver sets up a listener for messages from the backstage app
 * and sets the backend token if it is received
 *
 * @returns void
 */
export function setupBackstageMessageReceiver() {
  if (isBackstage()) {
    console.log('Running in backstage, so setting up token receiver');

    const handleMessage = async (event: MessageEvent) => {
      try {
        const { type, payload } = event.data as BackstageMessage;
        if (type === 'BACKSTAGE_AUTH_TOKEN') {
          const { token } = payload || {};
          if (token) {
            setBackstageToken(token);
            // send acknowledgement message back to parent after a timeout to ensure the parent is ready to receive the acknowledgement.
            setTimeout(() => {
              window.parent.postMessage({ type: 'BACKSTAGE_AUTH_TOKEN_ACK' }, '*');
            }, BACKSTAGE_ACK_TIMEOUT_MS);
          }
        } else if (type === 'BACKSTAGE_KUBECONFIG') {
          const kubeconfig = payload?.kubeconfig;
          if (kubeconfig) {
            // set the stateless cluster kubeconfig
            await storeKubeconfigFromBackstage(kubeconfig);
            // send acknowledgement message back to parent after a timeout to ensure the parent is ready to receive the acknowledgement.
            setTimeout(() => {
              window.parent.postMessage({ type: 'BACKSTAGE_KUBECONFIG_ACK' }, '*');
            }, BACKSTAGE_ACK_TIMEOUT_MS);
          }
        }
      } catch (error) {
        console.error('Error processing backstage message:', error);
      }
    };

    window.addEventListener('message', handleMessage);
  }
}
