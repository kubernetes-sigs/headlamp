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
import React, { useEffect } from 'react';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { KubeObjectClass } from '../../../lib/k8s/KubeObject';

/** Valid Kubernetes auth verbs */
const VALID_AUTH_VERBS = [
  'create',
  'get',
  'list',
  'watch',
  'update',
  'patch',
  'delete',
  'deletecollection',
] as const;

export interface AuthVisibleProps extends React.PropsWithChildren<{}> {
  item: KubeObject | KubeObjectClass | null;
  authVerb: string;
  subresource?: string;
  namespace?: string;
  onError?: (err: Error) => void;
  onAuthResult?: (result: { allowed: boolean; reason: string }) => void;
}

export default function AuthVisible(props: AuthVisibleProps) {
  const { item, authVerb, subresource, namespace, onError, onAuthResult, children } = props;

  const isValidAuthVerb = VALID_AUTH_VERBS.includes(authVerb as any);

  // Normalize item inputs safely
  const itemClass: KubeObjectClass | null =
    (item as KubeObject)?._class?.() ?? (item as KubeObjectClass) ?? null;

  const itemName =
    item && 'getName' in item && typeof item.getName === 'function' ? item.getName() : undefined;

  const hasValidInput = !!item && isValidAuthVerb;

  // Hooks must be called unconditionally and in the same order on every render.
  const { data, error } = useQuery<any>({
    enabled: hasValidInput,
    queryKey: [
      'authVisible',
      itemName,
      itemClass?.apiName,
      itemClass?.apiVersion,
      authVerb,
      subresource,
      namespace,
    ],
    queryFn: async () => {
      try {
        return await item!.getAuthorization(
          authVerb,
          { subresource, namespace },
          (item as any).cluster
        );
      } catch (e: any) {
        onError?.(e);
        throw e;
      }
    },
  });

  const visible = data?.status?.allowed ?? false;

  useEffect(() => {
    if (!data) return;

    onAuthResult?.({
      allowed: visible,
      reason: data.status?.reason ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, visible, onAuthResult]);

  // Move all early returns after hooks
  if (!isValidAuthVerb) {
    // eslint-disable-next-line no-console
    console.warn(`Invalid authVerb provided: "${authVerb}". Skipping authorization check.`);
    return null;
  }

  if (error) {
    return null;
  }

  if (!visible) {
    return null;
  }

  return <>{children}</>;
}
