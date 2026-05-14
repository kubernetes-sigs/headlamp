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

import { Box, TextField, Typography } from '@mui/material';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSelectedClusters } from '../../lib/k8s';
import { apiDiscovery } from '../../lib/k8s/api/v2/apiDiscovery';
import type { ApiResource } from '../../lib/k8s/api/v2/ApiResource';
import { apiResourceId } from '../../lib/k8s/api/v2/ApiResource';
import {
  genericResourceRefFromApiResource,
  serializeGenericResourceRef,
} from '../../lib/k8s/genericResourceRef';
import EmptyContent from '../common/EmptyContent';
import Link from '../common/Link';
import Loader from '../common/Loader';
import { PageGrid } from '../common/Resource/Resource';
import SectionBox from '../common/SectionBox';
import Table from '../common/Table';

export default function GenericResourcePicker() {
  const { t } = useTranslation(['translation', 'glossary']);
  const selectedClusters = useSelectedClusters();
  const [filter, setFilter] = React.useState('');

  const { data: resources, isPending, isError, error } = useQuery({
    queryFn: () => apiDiscovery([...selectedClusters]),
    queryKey: ['api-discovery', ...selectedClusters],
  });

  const rows = React.useMemo(() => {
    if (!resources) return [];
    const q = filter.trim().toLowerCase();
    const sorted = [...resources].sort((a, b) => {
      const ak = `${a.apiVersion} ${a.kind}`.toLowerCase();
      const bk = `${b.apiVersion} ${b.kind}`.toLowerCase();
      return ak.localeCompare(bk);
    });
    if (!q) return sorted;
    return sorted.filter(
      r =>
        r.kind.toLowerCase().includes(q) ||
        r.apiVersion.toLowerCase().includes(q) ||
        r.pluralName.toLowerCase().includes(q) ||
        (r.groupName ?? '').toLowerCase().includes(q)
    );
  }, [resources, filter]);

  if (isPending) {
    return <Loader title={t('translation|Loading')} />;
  }

  if (isError) {
    return (
      <PageGrid>
        <SectionBox title={t('translation|Generic resources')}>
          <Alert severity="error" variant="outlined">
            <AlertTitle>{t('translation|Failed to load resources')}</AlertTitle>
            {error instanceof Error ? error.message : String(error)}
          </Alert>
        </SectionBox>
      </PageGrid>
    );
  }

  const resourceList = resources ?? [];
  const noDiscovery = resourceList.length === 0;
  const noFilterMatches =
    !noDiscovery && rows.length === 0 && filter.trim().length > 0;

  return (
    <PageGrid>
      <SectionBox title={t('translation|Generic resources')}>
        <Box sx={{ mb: 2 }}>
          <TextField
            label={t('translation|Filter')}
            value={filter}
            onChange={e => setFilter(e.target.value)}
            size="small"
            fullWidth
            variant="outlined"
          />
        </Box>
        {noDiscovery && (
          <EmptyContent>
            <Typography color="text.secondary" component="span">
              {t('translation|No API resources were discovered.')}
            </Typography>
          </EmptyContent>
        )}
        {noFilterMatches && (
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {t('translation|No resources match the filter.')}
          </Typography>
        )}
        {!noDiscovery && (
          <Table
            columns={[
              {
                id: 'kind',
                header: t('glossary|Kind'),
                accessorFn: (r: ApiResource) => r.kind,
              },
              {
                id: 'apiVersion',
                header: t('translation|API version'),
                accessorFn: (r: ApiResource) => r.apiVersion,
              },
              {
                id: 'scope',
                header: t('translation|Scope'),
                accessorFn: (r: ApiResource) =>
                  r.isNamespaced ? t('translation|Namespaced') : t('translation|Cluster-wide'),
              },
              {
                id: 'plural',
                header: t('translation|Resource'),
                accessorFn: (r: ApiResource) => r.pluralName,
              },
              {
                id: 'open',
                header: '',
                accessorFn: () => '',
                Cell: ({ row }: { row: { original: ApiResource } }) => {
                  const r = row.original;
                  const resourceId = serializeGenericResourceRef(
                    genericResourceRefFromApiResource(r)
                  );
                  return (
                    <Link routeName="genericResourceList" params={{ resourceId }}>
                      {t('translation|View')}
                    </Link>
                  );
                },
              },
            ]}
            data={rows}
            reflectInURL={false}
            getRowId={(r: ApiResource) => apiResourceId(r)}
          />
        )}
      </SectionBox>
    </PageGrid>
  );
}
