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

import _ from 'lodash';
import { getCluster } from '../../../cluster';
import type { KubeObjectInterface, KubeObjectInterfaceCreate } from '../../KubeObject';
import type { ApiError } from '../v2/ApiError';
import { getDiscoveredConnectionRevision } from '../v2/discoveredConnectionRevisions';
import {
  assertCurrentDiscoveryConnection,
  bindDiscoveryConnection,
  createDiscoveryConnectionChangedError,
  getResourceDiscoveryConnection,
  isDiscoveryConnectionChanged,
} from '../v2/discoveryConnection';
import { getClusterDefaultNamespace } from './clusterApi';
import { resourceDefToApiFactory } from './factories';
import type { QueryParameters } from './queryParameters';

export interface ApplyOptions {
  dryRun?: boolean;
}

/**
 * Applies the provided body to the Kubernetes API.
 *
 * Tries to POST, and if there's a conflict it does a PUT to the api endpoint.
 *
 *
 * @param body - The kubernetes object body to apply.
 * @param clusterName - The cluster to apply the body to. By default uses the current cluster (URL defined).
 *
 * @returns The response from the kubernetes API server.
 */
export async function apply<T extends KubeObjectInterfaceCreate>(
  body: T,
  clusterName?: string,
  options?: ApplyOptions
): Promise<T> {
  return prepareApply(clusterName)(body, options);
}

/** Capture the destination at confirmation, before a deferred or multi-resource apply starts. */
export function prepareApply(clusterName?: string, source?: object) {
  const cluster = clusterName || getCluster() || undefined;
  const origin = source && getResourceDiscoveryConnection(source);
  const currentRevision = cluster ? getDiscoveredConnectionRevision(cluster) : undefined;
  const revision = origin ? origin.revision : currentRevision;
  const defaultNamespace = (cluster && getClusterDefaultNamespace(cluster)) || 'default';

  return async <T extends KubeObjectInterfaceCreate>(body: T, options?: ApplyOptions) => {
    if (origin && origin.cluster !== cluster) {
      throw createDiscoveryConnectionChangedError();
    }
    return applyToConnection(body, { cluster, revision, defaultNamespace }, options);
  };
}

interface ApplyDestination {
  cluster?: string;
  revision?: string;
  defaultNamespace: string;
}

function applyToConnection<T extends KubeObjectInterfaceCreate>(
  body: T,
  destination: ApplyDestination,
  options?: ApplyOptions
): Promise<T>;
async function applyToConnection<T extends KubeObjectInterface>(
  body: T,
  { cluster, revision, defaultNamespace }: ApplyDestination,
  options: ApplyOptions = {}
): Promise<T> {
  assertCurrentDiscoveryConnection(cluster, revision);
  const bodyToApply = _.cloneDeep(body);
  const queryParams: QueryParameters = bindDiscoveryConnection(
    options.dryRun ? { dryRun: 'All' } : {},
    revision
  );

  let apiEndpoint;
  try {
    apiEndpoint = await resourceDefToApiFactory(bodyToApply, cluster, { revision });
  } catch (err) {
    console.error(`Error getting api endpoint when applying the resource ${bodyToApply}: ${err}`);
    throw err;
  }

  assertCurrentDiscoveryConnection(cluster, revision);
  if (apiEndpoint.isNamespaced && !bodyToApply.metadata.namespace) {
    bodyToApply.metadata.namespace = defaultNamespace;
  }

  const resourceVersion = bodyToApply.metadata.resourceVersion;

  try {
    delete bodyToApply.metadata.resourceVersion;
    return await apiEndpoint.post(bodyToApply, queryParams, cluster!);
  } catch (err) {
    // We had a conflict or cannot create. Try a PUT in case the resource already exists.
    const errorCode = (err as ApiError).status;
    if (isDiscoveryConnectionChanged(err)) throw err;
    if (errorCode !== 409 && errorCode !== 403) throw err;

    // Preserve the resourceVersion if its an update request
    bodyToApply.metadata.resourceVersion = resourceVersion;
    // We had a conflict. Try a PUT
    assertCurrentDiscoveryConnection(cluster, revision);
    return apiEndpoint.put(bodyToApply, queryParams, cluster!) as Promise<T>;
  }
}
