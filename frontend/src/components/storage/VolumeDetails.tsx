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

import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import PersistentVolume, { KubeClaimRef } from '../../lib/k8s/persistentVolume';
import Link from '../common/Link';
import { DetailsGrid } from '../common/Resource';
import { StatusLabelByPhase } from './utils';

export function makePVStatusLabel(item: PersistentVolume) {
  const status = item.status?.phase ?? '';
  return StatusLabelByPhase(status);
}

function renderClaimRef(claimRef: KubeClaimRef, cluster?: string): ReactNode {
  if (claimRef.kind === 'PersistentVolumeClaim' && claimRef.name && claimRef.namespace) {
    return (
      <Link
        routeName="persistentVolumeClaim"
        params={{ namespace: claimRef.namespace, name: claimRef.name }}
        activeCluster={cluster}
        tooltip
      >
        {`${claimRef.namespace}/${claimRef.name}`}
      </Link>
    );
  }
  if (claimRef.name) {
    return `${claimRef.namespace ? `${claimRef.namespace}/` : ''}${claimRef.name}`;
  }
  return '';
}

export default function VolumeDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={PersistentVolume}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item => {
        if (!item) return [];
        const { spec, status } = item;
        const claimRef = spec?.claimRef;
        const sourceType = item.getSourceType();

        return [
          {
            name: t('translation|Status'),
            value: makePVStatusLabel(item),
          },
          {
            name: t('Capacity'),
            value: spec?.capacity?.storage,
          },
          {
            name: t('Access Modes'),
            value: spec?.accessModes?.join(', '),
            hide: !spec?.accessModes?.length,
          },
          {
            name: t('Volume Mode'),
            value: spec?.volumeMode,
            hide: !spec?.volumeMode,
          },
          {
            name: t('Reclaim Policy'),
            value: spec?.persistentVolumeReclaimPolicy,
            hide: !spec?.persistentVolumeReclaimPolicy,
          },
          {
            name: t('Storage Class'),
            value: spec?.storageClassName ? (
              <Link
                routeName="storageClass"
                params={{ name: spec.storageClassName }}
                activeCluster={item.cluster}
                tooltip
              >
                {spec.storageClassName}
              </Link>
            ) : (
              ''
            ),
            hide: !spec?.storageClassName,
          },
          {
            name: t('Claim'),
            value: claimRef ? renderClaimRef(claimRef, item.cluster) : '',
            hide: !claimRef,
          },
          {
            name: t('Source'),
            value: sourceType,
            hide: !sourceType,
          },
          {
            name: t('translation|Reason'),
            value: status?.reason,
            hide: !status?.reason,
          },
          {
            name: t('translation|Message'),
            value: status?.message,
            hide: !status?.message,
          },
        ];
      }}
    />
  );
}
