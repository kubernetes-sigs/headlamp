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

import Box from '@mui/material/Box';
import { useTranslation } from 'react-i18next';
import EndpointSlice from '../../lib/k8s/endpointSlices';
import { LabelListItem } from '../common';
import { StatusLabel } from '../common/Label';
import ResourceListView from '../common/Resource/ResourceListView';

function renderEndpoints(endpointSlice: EndpointSlice) {
  const endpoints = endpointSlice.spec.endpoints;
  if (!endpoints) {
    return null;
  }

  return endpoints.map((endpoint: any) => {
    const { addresses, conditions } = endpoint;
    return (
      <Box display="inline-block">
        <StatusLabel status={conditions?.ready ? 'success' : 'error'}>
          {addresses.join(',')}
        </StatusLabel>
      </Box>
    );
  });
}

export default function EndpointSliceList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('glossary|Endpoint Slices')}
      resourceClass={EndpointSlice}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'endpoints',
          label: t('translation|Endpoints'),
          getValue: endpoint =>
            endpoint.spec?.endpoints?.map((c: any) => c.addresses?.join(','))?.join(','),
          render: endpoint => renderEndpoints(endpoint),
          gridTemplate: 'auto',
          cellProps: {
            sx: {
              flexWrap: 'wrap',
              gap: '4px',
            },
          },
        },
        {
          id: 'ports',
          label: t('Ports'),
          gridTemplate: 'auto',
          getValue: endpoint => endpoint.ports?.join(', '),
          render: endpoint => <LabelListItem labels={endpoint.ports ?? []} />,
        },
        {
          id: 'addressType',
          label: t('translation|Address Type'),
          filterVariant: 'multi-select',
          getValue: endpoint => endpoint?.spec?.addressType ?? '',
        },
        'age',
      ]}
    />
  );
}
