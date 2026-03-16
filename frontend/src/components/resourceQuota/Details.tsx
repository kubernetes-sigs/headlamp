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
import { useParams } from 'react-router-dom';
import ResourceQuota from '../../lib/k8s/resourceQuota';
import { compareUnits, normalizeUnit } from '../../lib/util';
import { DetailsGrid } from '../common/Resource';
import SimpleTable from '../common/SimpleTable';

export function ResourceQuotaTable({
  resourceStats,
}: {
  resourceStats: {
    name: string;
    hard: string;
    used: string;
  }[];
}) {
  const { t } = useTranslation();

  return (
    <SimpleTable
      data={resourceStats}
      columns={[
        {
          label: t('glossary|Resource'),
          getter: item => item.name,
        },
        {
          label: t('translation|Used'),
          getter: item => {
            const normalizedUnit = normalizeUnit(item.name, item.used);
            return compareUnits(item.used, normalizedUnit)
              ? normalizedUnit
              : `${item.used} (${normalizedUnit})`;
          },
        },
        {
          label: t('translation|Hard'),
          getter: item => {
            const normalizedUnit = normalizeUnit(item.name, item.hard);
            return compareUnits(item.hard, normalizedUnit)
              ? normalizedUnit
              : `${item.hard} (${normalizedUnit})`;
          },
        },
      ]}
    />
  );
}

export default function ResourceQuotaDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  return (
    <DetailsGrid
      resourceType={ResourceQuota}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Status'),
            value: <ResourceQuotaTable resourceStats={item.resourceStats} />,
          },
        ]
      }
    />
  );
}
