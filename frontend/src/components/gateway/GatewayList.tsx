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

import { useTranslation } from 'react-i18next';
import Gateway from '../../lib/k8s/gateway';
import Link from '../common/Link';
import ResourceListView from '../common/Resource/ResourceListView';
import { makeGatewayStatusLabel } from './ClassList';

export default function GatewayList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('Gateways')}
      resourceClass={Gateway}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'class',
          label: t('Class Name'),
          getValue: gateway => gateway.spec?.gatewayClassName,
          render: gateway =>
            gateway.spec?.gatewayClassName ? (
              <Link routeName="gatewayclass" params={{ name: gateway.spec?.gatewayClassName }}>
                {gateway.spec?.gatewayClassName}
              </Link>
            ) : null,
        },
        {
          id: 'conditions',
          label: t('translation|Conditions'),
          getValue: (gateway: Gateway) =>
            gateway.status?.conditions?.find(({ status }: { status: string }) => status === 'True')
              ?.type || null,
          render: (gateway: Gateway) => makeGatewayStatusLabel(gateway.status?.conditions || null),
        },
        {
          id: 'listeners',
          label: t('translation|Listeners'),
          getValue: (gateway: Gateway) => gateway.spec.listeners.length,
        },
        'age',
      ]}
    />
  );
}
