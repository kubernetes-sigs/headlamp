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
import type { DeviceRequest } from '../../lib/k8s/resourceClaim';
import { getRequestedDeviceClasses } from '../../lib/k8s/resourceClaim';
import Link from '../common/Link';
import SimpleTable from '../common/SimpleTable';

export interface DeviceRequestsTableProps {
  requests: DeviceRequest[];
  cluster?: string;
  emptyMessage: string;
}

export default function DeviceRequestsTable({
  requests,
  cluster,
  emptyMessage,
}: DeviceRequestsTableProps) {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <SimpleTable
      columns={[
        {
          label: t('translation|Request'),
          getter: (request: DeviceRequest) => request.name,
        },
        {
          label: t('glossary|Device Classes'),
          getter: (request: DeviceRequest) =>
            getRequestedDeviceClasses(request).map((className, index) => (
              <div key={`${className}-${index}`}>
                <Link routeName="deviceClass" params={{ name: className }} activeCluster={cluster}>
                  {className}
                </Link>
              </div>
            )),
        },
        {
          label: t('translation|Count'),
          gridTemplate: 'min-content',
          getter: (request: DeviceRequest) =>
            request.exactly
              ? request.exactly.allocationMode === 'All'
                ? t('translation|All')
                : request.exactly.count ?? ''
              : request.firstAvailable?.map(subrequest => (
                  <div key={subrequest.name}>
                    {subrequest.allocationMode === 'All'
                      ? t('translation|All')
                      : subrequest.count ?? ''}
                  </div>
                )),
        },
      ]}
      data={requests}
      emptyMessage={emptyMessage}
    />
  );
}
