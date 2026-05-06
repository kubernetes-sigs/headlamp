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
import { KubeObject, KubeObjectClass } from '../../../lib/k8s/KubeObject';

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
] as const;

type AuthVerb = (typeof VALID_AUTH_VERBS)[number];

function isAuthVerb(authVerb: string): authVerb is AuthVerb {
  return (VALID_AUTH_VERBS as readonly string[]).includes(authVerb);
}

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

  const onAuthResultRef = useRef(onAuthResult);

  useEffect(() => {
    onAuthResultRef.current = onAuthResult;
  }, [onAuthResult]);

  const isValidAuthVerb = isAuthVerb(authVerb);

  const itemObject = item instanceof KubeObject ? item : null;
  const itemClass: KubeObjectClass | null = item instanceof KubeObject ? item._class() : item;
  const itemName = itemObject?.getName();

  const { data } = useQuery<any>({
    enabled: !!item && isValidAuthVerb,
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
        if (!item) {
          return null;
        }

        if (item instanceof KubeObject) {
          return item.getAuthorization(authVerb, { subresource, namespace });
        }

        return item.getAuthorization(authVerb, { subresource, namespace });
      } catch (e: any) {
        onError?.(e);
        throw e;
      }
    },
  });

  const visible = data?.status?.allowed ?? false;

  useEffect(() => {
    if (!data) return;

    onAuthResultRef.current?.({
      allowed: data.status?.allowed ?? false,
      reason: data.status?.reason ?? '',
    });
  }, [data]);

  if (!isValidAuthVerb) {
    console.warn(`Invalid authVerb provided: "${authVerb}". Skipping authorization check.`);
    return null;
  }

  if (!visible) {
    return null;
  }

  return <>{children}</>;
}
