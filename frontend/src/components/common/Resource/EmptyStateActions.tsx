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

  const handleRefresh = () => {
    // Silence transient errors (network drop, K8s API blip). The user can
    // retry; failures already surface through the existing snackbar path.
    queryClient.refetchQueries({ type: 'active' }).catch(() => {});
  };

  return (
    <>
      {resourceClass?.kind && (
        <CreateResourceButton resourceClass={resourceClass} variant="labeled" />
      )}
      <Button
        variant="outlined"
        startIcon={<InlineIcon icon="mdi:refresh" />}
        aria-label={t('translation|Refresh list')}
        onClick={handleRefresh}
      >
        {t('translation|Refresh')}
      </Button>
    </>
  );
}
