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

import { KubeObject, type KubeObjectClass } from '../../lib/k8s/KubeObject';

// Ensure the base class is initialized before resource models are loaded dynamically.
void KubeObject;

let searchResourceClassesPromise: Promise<KubeObjectClass[]> | null = null;

/**
 * Loads Kubernetes resource classes used by global search in a separate chunk so
 * opening the search UI does not eagerly bundle every list model up front.
 */
export function loadSearchResourceClasses(): Promise<KubeObjectClass[]> {
  if (!searchResourceClassesPromise) {
    searchResourceClassesPromise = Promise.all([
      import('../../lib/k8s/pod'),
      import('../../lib/k8s/deployment'),
      import('../../lib/k8s/service'),
      import('../../lib/k8s/job'),
      import('../../lib/k8s/cronJob'),
      import('../../lib/k8s/configMap'),
      import('../../lib/k8s/namespace'),
      import('../../lib/k8s/statefulSet'),
      import('../../lib/k8s/replicaSet'),
      import('../../lib/k8s/persistentVolumeClaim'),
      import('../../lib/k8s/endpoints'),
      import('../../lib/k8s/endpointSlices'),
      import('../../lib/k8s/ingress'),
      import('../../lib/k8s/serviceAccount'),
      import('../../lib/k8s/node'),
      import('../../lib/k8s/jobSet'),
    ])
      .then(modules => modules.map(module => module.default as KubeObjectClass))
      .catch(error => {
        // Allow a later call to retry if chunk loading fails once.
        searchResourceClassesPromise = null;
        throw error;
      });
  }

  return searchResourceClassesPromise;
}
