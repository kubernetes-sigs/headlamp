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
import PersistentVolume from '../../lib/k8s/persistentVolume';
import LabelListItem from '../common/LabelListItem';
import Link from '../common/Link';
import ResourceListView from '../common/Resource/ResourceListView';
import LightTooltip from '../common/Tooltip/TooltipLight';
import { makePVStatusLabel } from './VolumeDetails';

export default function VolumeList() {
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('Persistent Volumes')}
      headerProps={{
        noNamespaceFilter: true,
      }}
      resourceClass={PersistentVolume}
      columns={[
        'name',
        {
          id: 'className',
          label: t('Class Name'),
          getValue: volume => volume.spec.storageClassName ?? '',
          render: volume => {
            const name = volume.spec.storageClassName;
            if (!name) {
              return '';
            }
            return (
              <Link
                routeName="storageClass"
                params={{ name }}
                activeCluster={volume.cluster}
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
          getValue: volume => volume.spec.capacity.storage,
        },
        {
          id: 'accessModes',
          label: t('Access Modes'),
          getValue: volume => volume?.spec?.accessModes?.join(', '),
          render: volume => <LabelListItem labels={volume?.spec?.accessModes || []} />,
        },
        {
          id: 'reclaimPolicy',
          label: t('Reclaim Policy'),
          getValue: volume => volume.spec.persistentVolumeReclaimPolicy,
        },
        {
          id: 'reason',
          label: t('translation|Reason'),
          getValue: volume => volume.status.reason,
          render: volume => {
            const reason = volume.status.reason;
            return <LightTooltip title={reason}>{reason}</LightTooltip>;
          },
          show: false,
        },
        {
          id: 'claim',
          label: t('Claim'),
          getValue: volume => volume.spec?.claimRef?.name ?? '',
          render: volume => {
            const claim = volume.spec.claimRef?.name;
            if (!claim) {
              return null;
            }
            const claimNamespace = volume.spec.claimRef?.namespace;

            return (
              <Link
                routeName="persistentVolumeClaim"
                params={{ name: claim, namespace: claimNamespace }}
                activeCluster={volume.cluster}
                tooltip
              >
                {claim}
              </Link>
            );
          },
        },
        {
          id: 'status',
          label: t('translation|Status'),
          getValue: volume => volume.status?.phase,
          render: volume => makePVStatusLabel(volume),
          gridTemplate: 0.3,
        },
        'age',
      ]}
    />
  );
}
