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
import { KubeObject, KubeObjectClass } from '../../../lib/k8s/KubeObject';

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

type AuthVerb = (typeof VALID_AUTH_VERBS)[number];

function isAuthVerb(authVerb: string): authVerb is AuthVerb {
  return (VALID_AUTH_VERBS as readonly string[]).includes(authVerb);
}

function isKubeObjectInstance(item: KubeObject | KubeObjectClass | null): item is KubeObject {
  return (
    item !== null &&
    typeof item !== 'function' &&
    typeof (item as KubeObject).getName === 'function'
  );
}

export interface AuthVisibleProps extends React.PropsWithChildren {
  item: KubeObject | KubeObjectClass | null;
  authVerb: string;
  subresource?: string;
  namespace?: string;
  onError?: (err: Error) => void;
  onAuthResult?: (result: { allowed: boolean; reason: string }) => void;
}

export default function AuthVisible(props: AuthVisibleProps) {
  const { item, authVerb, subresource, namespace, onError, onAuthResult, children } = props;

  const onAuthResultRef = useRef(onAuthResult);
  useEffect(() => {
    onAuthResultRef.current = onAuthResult;
  }, [onAuthResult]);

  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const isValidAuthVerb = isAuthVerb(authVerb);
  const isInstance = isKubeObjectInstance(item);
  const itemObject = isInstance ? item : null;
  const itemClass: KubeObjectClass | null = isInstance ? item._class() : item;
  const itemName = itemObject?.getName();
  const cluster = itemObject?.cluster ?? getCluster() ?? '';

  const { data } = useQuery<any>({
    enabled: !!item && isValidAuthVerb,
    queryKey: [
      'authVisible',
      cluster,
      itemName,
      itemClass?.apiName,
      itemClass?.apiVersion,
      authVerb,
      subresource,
      namespace,
    ],
    retry: false,
    queryFn: async () => {
      if (!item) {
        return null;
      }
      try {
        if (isInstance) {
          return await item.getAuthorization(authVerb, { subresource, namespace });
        }
        if (!itemClass) {
          return null;
        }
        return await itemClass.getAuthorization(authVerb, { subresource, namespace }, cluster);
      } catch (e: any) {
        onErrorRef.current?.(e);
        return null;
      }
    },
  });

  useEffect(() => {
    if (!data) return;
    onAuthResultRef.current?.({
      allowed: data.status?.allowed ?? false,
      reason: data.status?.reason ?? '',
    });
  }, [data]);

  useEffect(() => {
    if (!isValidAuthVerb) {
      console.warn(
        `AuthVisible: invalid authVerb "${authVerb}". ` +
          `Expected one of: ${VALID_AUTH_VERBS.join(', ')}. Skipping authorization check.`
      );
    }
  }, [authVerb, isValidAuthVerb]);

  if (!isValidAuthVerb) {
    return null;
  }

  const visible = data?.status?.allowed ?? false;

  if (!visible) {
    return null;
  }

  return <>{children}</>;
}
