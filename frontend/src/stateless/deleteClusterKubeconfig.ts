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
import { decodeBase64, encodeBase64 } from '../helpers/base64';
import { KubeconfigObject } from '../lib/k8s/kubeconfig';
import { findMatchingContexts } from '.';
import { visitKubeconfigRows } from './visitKubeconfigRows';

/**
 * Deletes a stateless context, retaining other contexts and referenced clusters/users.
 * @returns The original encoded kubeconfig, or null if no context matched.
 */
export async function deleteClusterKubeconfig(
  clusterName: string,
  clusterID?: string
): Promise<string | null> {
  return visitKubeconfigRows<string | null>('readwrite', cursor => {
    if (!cursor) {
      return { value: null };
    }
    const row = cursor.value;
    const kubeconfig64 = row.kubeconfig;
    const parsed = jsyaml.load(decodeBase64(kubeconfig64)) as KubeconfigObject;
    const { matchingKubeconfig, matchingContext } = findMatchingContexts(
      clusterName,
      parsed,
      clusterID
    );
    if (!matchingKubeconfig && !matchingContext) {
      return;
    }
    const contextName = matchingContext?.name ?? matchingKubeconfig?.name;
    parsed.contexts = (parsed.contexts || []).filter(context => context.name !== contextName);
    if (parsed['current-context'] === contextName) {
      const nextContext = parsed.contexts[0]?.name;
      if (nextContext) {
        parsed['current-context'] = nextContext;
      } else {
        Reflect.deleteProperty(parsed, 'current-context');
      }
    }
    const remainingRefs = new Set<string>(
      parsed.contexts.flatMap(c => {
        const refs: string[] = [];
        if (c.context.cluster) refs.push(c.context.cluster);
        if (c.context.user) refs.push(c.context.user);
        return refs;
      })
    );
    if (parsed.clusters) {
      parsed.clusters = parsed.clusters.filter(c => remainingRefs.has(c.name));
    }
    if (parsed.users) {
      parsed.users = parsed.users.filter(u => remainingRefs.has(u.name));
    }
    if (parsed.contexts.length === 0) {
      cursor.delete();
    } else {
      cursor.update({ ...row, kubeconfig: encodeBase64(jsyaml.dump(parsed)) });
    }
    return { value: kubeconfig64 };
  });
}
