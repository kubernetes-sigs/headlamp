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

import { getCluster } from '../../../cluster';
import type { KubeMetadata } from '../../KubeMetadata';
import { clusterRequest, patch, put } from './clusterRequests';

export interface ScaleApi {
  get: (namespace: string, name: string, clusterName?: string) => Promise<any>;
  put: (
    body: {
      metadata: KubeMetadata;
      spec: {
        replicas: number;
      };
    },
    clusterName?: string
  ) => Promise<any>;
  patch: (
    body: {
      spec: {
        replicas: number;
      };
    },
    metadata: KubeMetadata,
    clusterName?: string
  ) => Promise<any>;
}

export function apiScaleFactory(apiRoot: string, resource: string): ScaleApi {
  return {
    get: (namespace: string, name: string, clusterName?: string) => {
      const cluster = clusterName || getCluster() || '';
      return clusterRequest(url(namespace, name), { cluster });
    },
    put: (body: { metadata: KubeMetadata; spec: { replicas: number } }, clusterName?: string) => {
      const cluster = clusterName || getCluster() || '';
      return put(url(body.metadata.namespace!, body.metadata.name), body, undefined, { cluster });
    },
    patch: (
      body: {
        spec: {
          replicas: number;
        };
      },
      metadata: KubeMetadata,
      clusterName?: string
    ) => {
      const cluster = clusterName || getCluster() || '';
      return patch(url(metadata.namespace!, metadata.name), body, false, { cluster });
    },
  };

  function url(namespace: string, name: string) {
    return `${apiRoot}/namespaces/${namespace}/${resource}/${name}/scale`;
  }
}
