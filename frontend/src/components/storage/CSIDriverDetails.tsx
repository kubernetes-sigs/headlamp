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
import CSIDriver from '../../lib/k8s/csiDriver';
import { DetailsGrid } from '../common/Resource';

export default function CSIDriverDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  const yesNo = (value?: boolean) => (value ? t('translation|Yes') : t('translation|No'));

  return (
    <DetailsGrid
      resourceType={CSIDriver}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('Attach Required'),
            value: yesNo(item.spec?.attachRequired),
          },
          {
            name: t('Pod Info On Mount'),
            value: yesNo(item.spec?.podInfoOnMount),
          },
          {
            name: t('Storage Capacity'),
            value: yesNo(item.spec?.storageCapacity),
          },
          {
            name: t('FS Group Policy'),
            value: item.spec?.fsGroupPolicy,
            hide: !item.spec?.fsGroupPolicy,
          },
          {
            name: t('Requires Republish'),
            value: yesNo(item.spec?.requiresRepublish),
            hide: item.spec?.requiresRepublish === undefined,
          },
          {
            name: t('SELinux Mount'),
            value: yesNo(item.spec?.seLinuxMount),
            hide: item.spec?.seLinuxMount === undefined,
          },
          {
            name: t('Volume Lifecycle Modes'),
            value: item.spec?.volumeLifecycleModes?.join(', '),
            hide: !item.spec?.volumeLifecycleModes?.length,
          },
        ]
      }
    />
  );
}
