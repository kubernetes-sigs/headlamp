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

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hasAllowedNamespacesRestriction } from '../../helpers/clusterSettings';
import { useCluster, useSelectedClusters } from '../../lib/k8s';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { useTypedSelector } from '../../redux/hooks';
import Link from '../common/Link';

export interface ClusterGroupErrorMessageProps {
  /**
   * Array of errors
   */
  errors?: ApiError[] | null;
  /**
   * Whether the failed requests were for namespaced resources, in which case a forbidden
   * response may only mean they were asked for across the whole cluster.
   */
  namespacedResource?: boolean;
}

export function ClusterGroupErrorMessage({
  errors,
  namespacedResource,
}: ClusterGroupErrorMessageProps) {
  if (!errors || errors?.length === 0) {
    return null;
  }

  const forbidden = errors.find(error => error.status === 403);

  return (
    <>
      {errors.map((error, i) => (
        <ErrorMessage error={error} key={error.stack ?? i} />
      ))}
      {namespacedResource && forbidden && <NamespaceScopeHint cluster={forbidden.cluster} />}
    </>
  );
}

/**
 * Points a user who cannot list a cluster's namespaces at the setting that tells Headlamp
 * which ones to ask for. Without it every request goes cluster-wide and is refused, and
 * Kubernetes offers no way to discover the namespaces such a user may read.
 */
function NamespaceScopeHint({ cluster: errorCluster }: { cluster?: string }) {
  const { t } = useTranslation();
  const currentCluster = useCluster();
  const cluster = errorCluster || currentCluster;
  const selectedNamespaces = useTypedSelector(state => state.filter.namespaces);
  // The request layer scopes lists by the allowed namespaces and by the selector that
  // resolves to more of them, so both count as a restriction. Claiming the whole cluster
  // was asked for would be untrue, and would point at a setting already filled in.
  const namespacesRestricted = hasAllowedNamespacesRestriction(cluster || '');

  if (selectedNamespaces.size > 0 || namespacesRestricted) {
    return null;
  }

  return (
    <Alert severity="info" sx={{ mb: 1 }}>
      {t(
        'Headlamp is requesting resources across the whole cluster. If you only have access to some namespaces, list them under Allowed namespaces in the cluster settings.'
      )}{' '}
      {cluster && (
        <Link routeName="settingsCluster" params={{ cluster }}>
          {t('translation|Cluster settings')}
        </Link>
      )}
    </Alert>
  );
}

function ErrorMessage({ error }: { error: ApiError }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const showClusterName = useSelectedClusters().length > 1;
  const [showMessage, setShowMessage] = useState(false);

  const defaultTitle = t('Failed to load resources');
  const forbiddenTitle = t("You don't have permissions to view this resource");
  const notFoundTitile = t('Resource not found');

  const isForbidden = error.status === 403;

  let title = defaultTitle;
  if (error.status === 404) {
    title = notFoundTitile;
  } else if (isForbidden) {
    title = forbiddenTitle;
  }

  const severity = isForbidden ? 'info' : 'warning';

  return (
    <Alert
      severity={severity}
      sx={{ mb: 1 }}
      action={
        <Button
          size="small"
          color={severity}
          onClick={() => setShowMessage(it => !it)}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {showMessage ? t('Hide details') : t('Show details')}
        </Button>
      }
    >
      <AlertTitle
        sx={{
          mb: showMessage ? undefined : 0,
          color: theme.palette.text.primary,
        }}
      >
        {title}
      </AlertTitle>
      {showMessage && (
        <>
          {showClusterName ? <Box>Cluster: {error.cluster}</Box> : null}
          {error.message}
        </>
      )}
    </Alert>
  );
}
