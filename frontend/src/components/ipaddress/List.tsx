/*
 * Copyright 2026 The Kubernetes Authors
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
import IPAddress from '../../lib/k8s/ipAddress';
import { useClustersServing } from '../../lib/k8s/resourceAvailability';
import Loader from '../common/Loader';
import ResourceListView from '../common/Resource/ResourceListView';
import SectionBox from '../common/SectionBox';

export default function IPAddressList() {
  const { t } = useTranslation(['glossary', 'translation']);
  const clusters = useClustersServing(IPAddress);
  const title = t('IP Addresses');

  if (!clusters) {
    return (
      <SectionBox title={title}>
        <Loader title={t('translation|Loading...')} />
      </SectionBox>
    );
  }

  return (
    <ResourceListView
      title={title}
      resourceClass={IPAddress}
      clusters={clusters}
      columns={[
        'name',
        'cluster',
        {
          id: 'parentRef',
          label: t('Parent Reference'),
          getValue: ({ parentRef }) =>
            parentRef
              ? [parentRef.group, parentRef.resource, parentRef.namespace, parentRef.name]
                  .filter(Boolean)
                  .join('/')
              : '-',
        },
        'age',
      ]}
    />
  );
}
