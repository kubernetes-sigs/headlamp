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
 * Updates a context's custom name without replacing its other extensions.
 * @throws Error if the context is missing or its transaction fails.
 */
export function updateStatelessClusterKubeconfig(
  kubeconfig: string,
  customName: string,
  clusterName: string
): Promise<void> {
  return visitKubeconfigRows<void>('readwrite', cursor => {
    if (!cursor) {
      throw new Error(`Cluster with name ${clusterName} not found`);
    }
    const row = cursor.value;
    const parsed = jsyaml.load(decodeBase64(row.kubeconfig)) as KubeconfigObject;
    const { matchingKubeconfig, matchingContext } = findMatchingContexts(clusterName, parsed);
    if (!matchingKubeconfig && !matchingContext) {
      return;
    }
    const target = matchingContext ?? matchingKubeconfig!;
    const extensions = target.context.extensions || [];
    const headlampExtensions = extensions.find(ext => ext.name === 'headlamp_info');
    if (!headlampExtensions) {
      extensions.push({ name: 'headlamp_info', extension: { customName } });
    } else {
      headlampExtensions.extension = { ...headlampExtensions.extension, customName };
    }
    target.context.extensions = extensions;
    cursor.update({ ...row, kubeconfig: encodeBase64(jsyaml.dump(parsed)) });
    return { value: undefined };
  });
}
