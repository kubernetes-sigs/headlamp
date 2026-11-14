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
import VolumeAttachment from '../../lib/k8s/volumeAttachment';
import Link from '../common/Link';
import { DetailsGrid } from '../common/Resource';

export default function VolumeAttachmentDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={VolumeAttachment}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('Attacher'),
            value: item.attacher,
          },
          {
            name: t('glossary|Node'),
            value: item.nodeName ? (
              <Link routeName="node" params={{ name: item.nodeName }} activeCluster={item.cluster}>
                {item.nodeName}
              </Link>
            ) : (
              '-'
            ),
          },
          {
            name: t('glossary|Persistent Volume'),
            value: item.spec?.source?.persistentVolumeName ? (
              <Link
                routeName="persistentVolume"
                params={{ name: item.spec.source.persistentVolumeName }}
                activeCluster={item.cluster}
                tooltip
              >
                {item.spec.source.persistentVolumeName}
              </Link>
            ) : (
              '-'
            ),
          },
          {
            name: t('Attached'),
            value: item.isAttached ? t('translation|Yes') : t('translation|No'),
          },
          {
            name: t('Attach Error'),
            value: item.status?.attachError?.message,
            hide: !item.status?.attachError?.message,
          },
          {
            name: t('Detach Error'),
            value: item.status?.detachError?.message,
            hide: !item.status?.detachError?.message,
          },
        ]
      }
    />
  );
}
