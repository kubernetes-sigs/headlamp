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
import PersistentVolumeClaim from '../../lib/k8s/persistentVolumeClaim';
import { Link } from '../common';
import LabelListItem from '../common/LabelListItem';
import ResourceListView from '../common/Resource/ResourceListView';
import { makePVCStatusLabel } from './ClaimDetails';

export default function VolumeClaimList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('Persistent Volume Claims')}
      resourceClass={PersistentVolumeClaim}
      columns={[
        'name',
        'namespace',
        {
          id: 'className',
          label: t('Class Name'),
          getValue: volumeClaim => volumeClaim.spec?.storageClassName,
          render: volumeClaim => {
            const name = volumeClaim.spec?.storageClassName;
            if (!name) {
              return '';
            }
            return (
              <Link
                routeName="storageClass"
                params={{ name }}
                activeCluster={volumeClaim.cluster}
                tooltip
              >
                {name}
              </Link>
            );
          },
        },
        {
          id: 'capacity',
          label: t('Capacity'),
          getValue: volumeClaim => volumeClaim.status?.capacity?.storage,
          gridTemplate: 0.8,
        },
        {
          id: 'accessModes',
          label: t('Access Modes'),
          getValue: volumeClaim => volumeClaim.spec?.accessModes?.join(', '),
          render: volumeClaim => <LabelListItem labels={volumeClaim.spec?.accessModes || []} />,
        },
        {
          id: 'volumeMode',
          label: t('Volume Mode'),
          getValue: volumeClaim => volumeClaim.spec?.volumeMode,
        },
        {
          id: 'volume',
          label: t('Volume'),
          getValue: volumeClaim => volumeClaim.spec?.volumeName,
          render: volumeClaim => {
            const name = volumeClaim.spec?.volumeName;
            if (!name) {
              return '';
            }
            return (
              <Link
                routeName="persistentVolume"
                params={{ name }}
                activeCluster={volumeClaim.cluster}
                tooltip
              >
                {name}
              </Link>
            );
          },
        },
        {
          id: 'status',
          label: t('translation|Status'),
          getValue: volume => volume.status?.phase,
          render: volume => makePVCStatusLabel(volume),
          gridTemplate: 0.3,
        },
        'age',
      ]}
    />
  );
}
