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

import { InlineIcon } from '@iconify/react';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { KubeObjectClass } from '../../../lib/k8s/cluster';
import { CreateResourceButton } from '../CreateResourceButton';

/** Props for {@link EmptyStateActions}. */
export interface EmptyStateActionsProps {
  /**
   * The resource class for the empty list. When provided AND the class has
   * a `kind`, a labeled Create button is rendered (gated by RBAC via
   * {@link CreateResourceButton}'s {@link AuthVisible} wrapper); otherwise
   * only the Refresh button appears.
   */
  resourceClass?: KubeObjectClass;
}

/**
 * Quick-action controls rendered inside an {@link Empty} state on a resource
 * list. Gives users a next step ("Create <Kind>", "Refresh") instead of a
 * dead-end message when a list is empty.
 */
export function EmptyStateActions({ resourceClass }: EmptyStateActionsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Ensure the spinner is visible even when the refetch completes
      // instantly (e.g. no active queries or cached response). Without this
      // the button flashes and the click reads as a no-op.
      await Promise.all([
        // Only refetch KubeObject list queries so clicking Refresh on an
        // empty list doesn't also blast auth / discovery / sidebar queries
        // that are unrelated to what the user sees. Kube list queries are
        // keyed with the `['kubeObject', 'list', ...]` prefix (see
        // `useKubeObjectList`). Silence the promise so a transient network
        // drop or K8s API blip on refresh doesn't bubble as an unhandled
        // rejection; the underlying query still surfaces the error through
        // its react-query observer state (which `ResourceTable` renders via
        // `ClusterGroupErrorMessage`), so the user isn't left in the dark.
        queryClient
          .refetchQueries({
            type: 'active',
            predicate: query => {
              const key = query.queryKey;
              return (
                Array.isArray(key) &&
                key.length >= 2 &&
                key[0] === 'kubeObject' &&
                key[1] === 'list'
              );
            },
          })
          .catch(() => {}),
        new Promise(resolve => setTimeout(resolve, 400)),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <>
      {resourceClass?.kind && (
        <CreateResourceButton resourceClass={resourceClass} variant="labeled" />
      )}
      <Button
        variant="outlined"
        startIcon={
          isRefreshing ? (
            <CircularProgress size={16} color="inherit" />
          ) : (
            <InlineIcon icon="mdi:refresh" />
          )
        }
        aria-label={t('translation|Refresh list')}
        onClick={handleRefresh}
        disabled={isRefreshing}
      >
        {isRefreshing ? t('translation|Refreshing') : t('translation|Refresh')}
      </Button>
    </>
  );
}
