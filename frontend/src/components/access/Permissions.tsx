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
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCluster } from '../../lib/k8s';
import { getClusterUserInfo, getSelfSubjectRulesReview } from '../../lib/k8s/api/v1/clusterApi';
import { apiDiscovery } from '../../lib/k8s/api/v2/apiDiscovery';
import type { ApiResource } from '../../lib/k8s/api/v2/ApiResource';
import Namespace from '../../lib/k8s/namespace';
import { PageGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import {
  getPermissionState,
  PermissionState,
  sortResourcesForPermissions,
} from './permissionUtils';

const PERMISSION_VERBS = ['get', 'list', 'create', 'update', 'patch', 'delete'];

function PermissionChip({ state }: { state: PermissionState }) {
  const { t } = useTranslation(['translation']);

  if (state === 'allowed') {
    return <Chip color="success" size="small" label={t('translation|Yes')} />;
  }

  if (state === 'limited') {
    return <Chip color="warning" size="small" label={t('translation|Named')} />;
  }

  return <Chip size="small" label={t('translation|No')} />;
}

function resourceLabel(resource: ApiResource) {
  const group = resource.groupName ? ` (${resource.groupName})` : '';
  return `${resource.kind}${group}`;
}

export default function Permissions() {
  const { t } = useTranslation(['translation', 'glossary']);
  const cluster = useCluster();
  const { items: namespaces, errors: namespaceErrors } = Namespace.useList();
  const namespaceNames = React.useMemo(
    () => (namespaces ?? []).map(namespace => namespace.metadata.name).sort(),
    [namespaces]
  );
  const [namespace, setNamespace] = React.useState('default');

  React.useEffect(() => {
    if (namespaceNames.length > 0 && !namespaceNames.includes(namespace)) {
      setNamespace(namespaceNames[0]);
    }
  }, [namespace, namespaceNames]);

  const userInfoQuery = useQuery({
    queryKey: ['permissionsUserInfo', cluster],
    queryFn: () => getClusterUserInfo(cluster || ''),
    enabled: !!cluster,
    staleTime: 5 * 60 * 1000,
  });

  const resourcesQuery = useQuery({
    queryKey: ['permissionsApiDiscovery', cluster],
    queryFn: () => apiDiscovery(cluster ? [cluster] : []),
    enabled: !!cluster,
    staleTime: 5 * 60 * 1000,
  });

  const rulesQuery = useQuery({
    queryKey: ['permissionsRulesReview', cluster, namespace],
    queryFn: () => getSelfSubjectRulesReview(namespace, cluster || ''),
    enabled: !!cluster && !!namespace,
    staleTime: 60 * 1000,
  });

  const resources = React.useMemo(
    () => sortResourcesForPermissions(resourcesQuery.data ?? []),
    [resourcesQuery.data]
  );
  const isLoading = userInfoQuery.isLoading || resourcesQuery.isLoading || rulesQuery.isLoading;
  const userInfo = userInfoQuery.data;
  const rulesStatus = rulesQuery.data?.status;

  return (
    <PageGrid>
      <SectionBox title={t('translation|Access')} py={2} mt={[4, 0, 0]}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2">{t('translation|Current user')}</Typography>
            <Typography variant="body1">
              {userInfo?.username || t('translation|Unknown')}
            </Typography>
          </Grid>
          <Grid item xs={12} md={8}>
            <Typography variant="subtitle2">{t('translation|Groups')}</Typography>
            <Box display="flex" flexWrap="wrap" gap={1} mt={0.5}>
              {(userInfo?.groups ?? []).length > 0 ? (
                userInfo?.groups?.map(group => <Chip key={group} size="small" label={group} />)
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {t('translation|No groups reported for this cluster.')}
                </Typography>
              )}
            </Box>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="subtitle2">{t('translation|Accessible namespaces')}</Typography>
            <Box display="flex" flexWrap="wrap" gap={1} mt={0.5}>
              {namespaceNames.length > 0 ? (
                namespaceNames.map(namespaceName => (
                  <Chip key={namespaceName} size="small" label={namespaceName} />
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {t('translation|Headlamp could not list namespaces for this user.')}
                </Typography>
              )}
            </Box>
          </Grid>
        </Grid>
      </SectionBox>

      <SectionBox title={t('translation|Permission matrix')} py={2}>
        <Box mb={2} display="flex" alignItems="center" gap={2} flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="permissions-namespace-label">{t('glossary|Namespace')}</InputLabel>
            <Select
              labelId="permissions-namespace-label"
              label={t('glossary|Namespace')}
              value={namespace}
              onChange={event => setNamespace(event.target.value)}
            >
              {namespaceNames.length === 0 && <MenuItem value={namespace}>{namespace}</MenuItem>}
              {namespaceNames.map(namespaceName => (
                <MenuItem key={namespaceName} value={namespaceName}>
                  {namespaceName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="body2" color="text.secondary">
            {t('translation|Permissions are evaluated for the selected cluster and namespace.')}
          </Typography>
        </Box>

        {namespaceErrors?.length ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t(
              'translation|Namespace list is restricted; showing permissions for {{ namespace }}.',
              {
                namespace,
              }
            )}
          </Alert>
        ) : null}

        {rulesStatus?.incomplete ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {rulesStatus.evaluationError ||
              t('translation|Kubernetes reported that this rules review is incomplete.')}
          </Alert>
        ) : null}

        {isLoading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" stickyHeader aria-label={t('translation|Permission matrix')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('translation|Resource')}</TableCell>
                  <TableCell>{t('translation|Scope')}</TableCell>
                  {PERMISSION_VERBS.map(verb => (
                    <TableCell key={verb} align="center">
                      {verb}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {resources.map(resource => (
                  <TableRow key={`${resource.apiVersion}/${resource.pluralName}`}>
                    <TableCell>
                      <Typography variant="body2">{resourceLabel(resource)}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {resource.pluralName}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {resource.isNamespaced ? t('glossary|Namespace') : t('translation|Cluster')}
                    </TableCell>
                    {PERMISSION_VERBS.map(verb => (
                      <TableCell key={verb} align="center">
                        <PermissionChip state={getPermissionState(rulesStatus, resource, verb)} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionBox>
    </PageGrid>
  );
}
