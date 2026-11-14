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
import VolumeAttachment from '../../lib/k8s/volumeAttachment';
import Link from '../common/Link';
import ResourceListView from '../common/Resource/ResourceListView';

export default function VolumeAttachmentList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('Volume Attachments')}
      headerProps={{
        noNamespaceFilter: true,
      }}
      resourceClass={VolumeAttachment}
      columns={[
        'name',
        {
          id: 'attacher',
          label: t('Attacher'),
          filterVariant: 'multi-select',
          getValue: item => item.attacher,
        },
        {
          id: 'node',
          label: t('glossary|Node'),
          getValue: item => item.nodeName,
          render: item =>
            item.nodeName ? (
              <Link routeName="node" params={{ name: item.nodeName }} activeCluster={item.cluster}>
                {item.nodeName}
              </Link>
            ) : (
              ''
            ),
        },
        {
          id: 'persistentVolume',
          label: t('glossary|Persistent Volume'),
          getValue: item => item.spec?.source?.persistentVolumeName,
          render: item => {
            const pvName = item.spec?.source?.persistentVolumeName;
            return pvName ? (
              <Link
                routeName="persistentVolume"
                params={{ name: pvName }}
                activeCluster={item.cluster}
                tooltip
              >
                {pvName}
              </Link>
            ) : (
              ''
            );
          },
        },
        {
          id: 'attached',
          label: t('Attached'),
          filterVariant: 'checkbox',
          getValue: item => String(item.isAttached),
          render: item => (item.isAttached ? t('translation|Yes') : t('translation|No')),
        },
        'age',
      ]}
    />
  );
}
