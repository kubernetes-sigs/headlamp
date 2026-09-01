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
import { decodeBase64, encodeBase64 } from './base64';
import { isBackstage } from './isBackstage';

// BACKSTAGE_TOKEN_STORAGE_KEY is the key used to store the backstage token in the local storage
const BACKSTAGE_TOKEN_STORAGE_KEY = 'backstage_token';

/**
 * getTrustedBackstageOrigins returns the origins that are allowed to exchange
 * postMessage data with the embedded Headlamp instance.
 *
 * Configured via the REACT_APP_BACKSTAGE_ORIGIN environment variable, which
 * may contain a single origin or a comma-separated list of origins (useful
 * when the same Headlamp build is embedded by more than one Backstage
 * deployment). If unset, no origin is trusted.
 *
 * @returns the list of trusted Backstage origins
 */
export function getTrustedBackstageOrigins(): string[] {
  const configuredOrigins = import.meta.env.REACT_APP_BACKSTAGE_ORIGIN;
  if (!configuredOrigins) {
    return [];
  }

  return configuredOrigins
    .split(',')
    .map((origin: string) => origin.trim())
    .filter(Boolean);
}

/**
 * isTrustedBackstageOrigin checks whether the given origin is a configured, trusted Backstage origin.
 *
 * @param origin - the origin to check, e.g. from a MessageEvent
 * @returns true if the origin is trusted
 */
export function isTrustedBackstageOrigin(origin: string): boolean {
  return getTrustedBackstageOrigins().includes(origin);
}

/**
 * setBackstageToken sets the backstage token in the local storage
 *
 * @param token - the token to set
 */
function setBackstageToken(token: string) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(BACKSTAGE_TOKEN_STORAGE_KEY, token);
  }
}

/**
 * getBackstageToken gets the backstage token from the local storage
 *
 * @returns the backstage token
 */
export function getBackstageToken(): string | null {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(BACKSTAGE_TOKEN_STORAGE_KEY);
  }
  return null;
}

/**
 * storeKubeconfigFromBackstage stores the kubeconfig from backstage as a stateless cluster kubeconfig
 *
 * @param kubeconfig - the kubeconfig to store
 */
async function storeKubeconfigFromBackstage(kubeconfig: string) {
  try {
    // Decode base64 kubeconfig
    const decodedKubeconfig = decodeBase64(kubeconfig);
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
        const newKubeconfigBase64 = encodeBase64(newKubeconfigYaml);
        await statelessFunctions.findAndReplaceKubeconfig(context.name, newKubeconfigBase64, true);
      }
    );
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

const BACKSTAGE_MESSAGE_TYPES: Array<BackstageMessage['type']> = [
  'BACKSTAGE_AUTH_TOKEN',
  'BACKSTAGE_KUBECONFIG',
];

/**
 * isBackstageMessage is a runtime type guard for BackstageMessage.
 *
 * event.data comes from outside the application, so its shape cannot be
 * relied upon to match the BackstageMessage type just because it is cast to
 * it. This checks the shape at runtime before the message is processed,
 * rejecting anything that doesn't match rather than letting mistyped fields
 * (e.g. a non-string token) flow into token/kubeconfig storage.
 *
 * @param data - the raw `event.data` from a postMessage event
 * @returns true if data is a well-formed BackstageMessage
 */
function isBackstageMessage(data: unknown): data is BackstageMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const { type, payload } = data as Record<string, unknown>;

  if (!BACKSTAGE_MESSAGE_TYPES.includes(type as BackstageMessage['type'])) {
    return false;
  }

  if (payload === undefined) {
    return true;
  }

  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const { token, kubeconfig } = payload as Record<string, unknown>;
  return (
    (token === undefined || typeof token === 'string') &&
    (kubeconfig === undefined || typeof kubeconfig === 'string')
  );
}

/**
 * Sets up a listener for messages from the Backstage app.
 * Handles Backstage auth token messages by storing the Backstage token,
 * and kubeconfig messages by storing the kubeconfig for stateless use.
 *
 * @returns A cleanup function that removes the registered message event listener.
 */
export function setupBackstageMessageReceiver(): () => void {
  if (isBackstage()) {
    const handleMessage = async (event: MessageEvent) => {
      // Reject messages from any origin that isn't an explicitly trusted Backstage origin.
      if (!isTrustedBackstageOrigin(event.origin)) {
        return;
      }

      if (!isBackstageMessage(event.data)) {
        return;
      }

      try {
        const { type, payload } = event.data;
        if (type === 'BACKSTAGE_AUTH_TOKEN') {
          const { token } = payload || {};
          if (token) {
            setBackstageToken(token);
            // send acknowledgement message back to parent after a timeout to ensure the parent is ready to receive the acknowledgement.
            setTimeout(() => {
              window.parent.postMessage({ type: 'BACKSTAGE_AUTH_TOKEN_ACK' }, event.origin);
            }, BACKSTAGE_ACK_TIMEOUT_MS);
          }
        } else if (type === 'BACKSTAGE_KUBECONFIG') {
          const kubeconfig = payload?.kubeconfig;
          if (kubeconfig) {
            // set the stateless cluster kubeconfig
            await storeKubeconfigFromBackstage(kubeconfig);
            // send acknowledgement message back to parent after a timeout to ensure the parent is ready to receive the acknowledgement.
            setTimeout(() => {
              window.parent.postMessage({ type: 'BACKSTAGE_KUBECONFIG_ACK' }, event.origin);
            }, BACKSTAGE_ACK_TIMEOUT_MS);
          }
        }
      } catch (error) {
        console.error('Error processing backstage message:', error);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }

  return () => {};
}
