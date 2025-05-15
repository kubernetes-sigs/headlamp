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
import PersistentVolume from '../../lib/k8s/persistentVolume';
import { Link } from '../common';
import { DetailsGrid } from '../common/Resource';
import { StatusLabelByPhase } from './utils';

export function makePVStatusLabel(item: PersistentVolume) {
  const status = item.status!.phase;
  return StatusLabelByPhase(status);
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
      extraInfo={item =>
        item && [
          {
            name: t('translation|Status'),
            value: makePVStatusLabel(item),
          },
          {
            name: t('Capacity'),
            value: item.spec!.capacity.storage,
          },
          {
            name: t('Access Modes'),
            value: item.spec!.accessModes.join(', '),
          },
          {
            name: t('Reclaim Policy'),
            value: item.spec!.persistentVolumeReclaimPolicy,
          },
          {
            name: t('Storage Class'),
            value: (
              <Link
                routeName="storageClass"
                params={{ name: item.spec!.storageClassName }}
                activeCluster={item.cluster}
                tooltip
              >
                {item.spec!.storageClassName}
              </Link>
            ),
          },
        ]
      }
    />
  );
}
