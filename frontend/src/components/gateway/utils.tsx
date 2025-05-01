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
import { GatewayParentReference } from '../../lib/k8s/gateway';
import { Link, SectionBox, SimpleTable } from '../common';

export function GatewayParentRefSection(props: { parentRefs: GatewayParentReference[] }) {
  const { parentRefs } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <SectionBox title={t('translation|ParentRefs')}>
      <SimpleTable
        emptyMessage={t('translation|No rules data to be shown.')}
        columns={[
          {
            label: t('translation|Name'),
            getter: (data: GatewayParentReference) => (
              <Link
                routeName={data.kind?.toLowerCase()}
                params={{ namespace: data.namespace, name: data.name }}
              >
                {data.name}
              </Link>
            ),
          },
          {
            label: t('translation|Namespace'),
            getter: (data: GatewayParentReference) => data.namespace,
          },
          {
            label: t('translation|Kind'),
            getter: (data: GatewayParentReference) => data.kind,
          },
          {
            label: t('translation|Group'),
            getter: (data: GatewayParentReference) => data.group,
          },
          {
            label: t('translation|Section Name'),
            getter: (data: GatewayParentReference) => data.sectionName,
          },
          {
            label: t('translation|Port'),
            getter: (data: GatewayParentReference) => data.port,
          },
        ]}
        data={parentRefs || []}
        reflectInURL="parentRefs"
      />
    </SectionBox>
  );
}
