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

import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import GatewayClass from '../../lib/k8s/gatewayClass';
import { LightTooltip, StatusLabel, StatusLabelProps } from '../common';
import ResourceListView from '../common/Resource/ResourceListView';

export function makeGatewayStatusLabel(conditions: any[] | null) {
  if (!conditions) {
    return null;
  }

  const conditionOptions = {
    Accepted: {
      status: 'success',
      icon: 'mdi:check-bold',
    },
  };

  const condition = conditions.find(
    ({ status, type }: { status: string; type: string }) =>
      type in conditionOptions && status === 'True'
  );

  if (!condition) {
    return null;
  }

  const tooltip = '';

  const conditionInfo = conditionOptions[condition.type as 'Accepted'];

  return (
    <LightTooltip title={tooltip} interactive>
      <Box display="inline">
        <StatusLabel status={conditionInfo.status as StatusLabelProps['status']}>
          {condition.type}
        </StatusLabel>
      </Box>
    </LightTooltip>
  );
}

export default function GatewayClassList() {
  const { t } = useTranslation('glossary');

  return (
    <ResourceListView
      title={t('Gateway Classes')}
      headerProps={{
        noNamespaceFilter: true,
      }}
      resourceClass={GatewayClass}
      columns={[
        'name',
        'cluster',
        {
          id: 'controllerName',
          label: t('Controller'),
          getValue: (gatewayClass: GatewayClass) => gatewayClass.spec?.controllerName,
        },
        {
          id: 'conditions',
          label: t('translation|Conditions'),
          getValue: (gatewayClass: GatewayClass) =>
            gatewayClass.status?.conditions?.find(
              ({ status }: { status: string }) => status === 'True'
            )?.type || null,
          render: (gatewayClass: GatewayClass) =>
            makeGatewayStatusLabel(gatewayClass.status?.conditions || null),
        },
        'age',
      ]}
    />
  );
}
