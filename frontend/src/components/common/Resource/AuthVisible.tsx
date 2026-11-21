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

import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useRef } from 'react';
import { getCluster } from '../../../lib/cluster';
import { ApiError } from '../../../lib/k8s/api/v2/ApiError';
import {
  getDiscoveredConnectionRevision,
  useDiscoveredConnectionRevisions,
} from '../../../lib/k8s/api/v2/discoveredConnectionRevisions';
import {
  DISCOVERY_CONNECTION_CHANGED,
  getResourceDiscoveryConnection,
  isDiscoveryConnectionChanged,
} from '../../../lib/k8s/api/v2/discoveryConnection';
import { shouldRetryKubeRequest } from '../../../lib/k8s/api/v2/retry';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { KubeObjectClass } from '../../../lib/k8s/KubeObject';

/** List of valid request verbs. See https://kubernetes.io/docs/reference/access-authn-authz/authorization/#determine-the-request-verb. */
const VALID_AUTH_VERBS = [
  'create',
  'get',
  'list',
  'watch',
  'update',
  'patch',
  'delete',
  'deletecollection',
];

export interface AuthVisibleProps extends React.PropsWithChildren<{}> {
  /** The item for which auth will be checked or a resource class (e.g. Job). */
  item: KubeObject | KubeObjectClass | null;
  /** The verb associated with the permissions being verifying. See https://kubernetes.io/docs/reference/access-authn-authz/authorization/#determine-the-request-verb . */
  authVerb: string;
  /** The subresource for which the permissions are being verifyied (e.g. "log" when checking for a pod's log). */
  subresource?: string;
  /** The namespace for which we're checking the permission, if applied. This is mostly useful when checking "creation" using a resource class, instead of an instance. */
  namespace?: string;
  /** The cluster to check the permission in. Defaults to the item's cluster, or the current one. This is mostly useful when checking "creation" using a resource class, which belongs to no cluster. */
  cluster?: string;
  /** Callback for when an error occurs.
   * @param err The error that occurred.
   */
  onError?: (err: Error) => void;
  /** Callback for when the authorization is checked.
   * @param result The result of the authorization check. Its `allowed` member will be true if the user is authorized to perform the specified action on the given resource; false otherwise. The `reason` member will contain a string explaining why the user is authorized or not.
   */
  onAuthResult?: (result: { allowed: boolean; reason: string }) => void;
}

/** A component that will only render its children if the user is authorized to perform the specified action on the given resource.
 * @param props The props for the component.
 */
export default function AuthVisible(props: AuthVisibleProps) {
  const { item, authVerb, subresource, namespace, onError, onAuthResult, children } = props;
  const { cluster: clusterProp } = props;

  const isAuthVerbValid = VALID_AUTH_VERBS.includes(authVerb);

  useEffect(() => {
    if (!isAuthVerbValid) {
      console.warn(`Invalid authVerb provided: "${authVerb}". Skipping authorization check.`);
    }
  }, [isAuthVerbValid, authVerb]);

  const itemClass: KubeObjectClass | null = (item as KubeObject)?._class?.() ?? item;
  const itemName = (item as KubeObject)?.getName?.();
  const cluster = clusterProp ?? (item as KubeObject)?.cluster ?? getCluster();
  const revisions = useDiscoveredConnectionRevisions();
  const revision = cluster ? revisions.get(cluster) : undefined;
  const origin = item && getResourceDiscoveryConnection(item);
  const currentConnection = !origin || origin.cluster !== cluster || origin.revision === revision;

  const { data: authorization, error } = useQuery<any, Error>({
    enabled: !!item && isAuthVerbValid && currentConnection,
    retry: (failures, error) =>
      !isDiscoveryConnectionChanged(error) && shouldRetryKubeRequest(failures, error),
    queryKey: [
      'authVisible',
      itemName,
      itemClass?.apiName,
      itemClass?.apiVersion,
      authVerb,
      subresource,
      namespace,
      cluster,
      revision,
    ],
    queryFn: async ({ signal }) => {
      if (cluster && getDiscoveredConnectionRevision(cluster) !== revision) {
        throw new ApiError(DISCOVERY_CONNECTION_CHANGED, { status: 409 });
      }
      signal.throwIfAborted();
      const result = await item!.getAuthorization(
        authVerb,
        { subresource, namespace },
        cluster ?? undefined
      );
      signal.throwIfAborted();
      return result ?? null;
    },
  });

  useEffect(() => {
    if (error && currentConnection) onError?.(error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, currentConnection]);

  const data = currentConnection && !error ? authorization : undefined;
  const visible = data?.status?.allowed ?? false;
  const wasAllowed = useRef(false);

  useEffect(() => {
    if (data || wasAllowed.current) {
      onAuthResult?.({
        allowed: visible,
        reason: data?.status?.reason ?? '',
      });
    }
    wasAllowed.current = visible;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!isAuthVerbValid) {
    return null;
  }

  if (!visible) {
    return null;
  }

  return <>{children}</>;
}
