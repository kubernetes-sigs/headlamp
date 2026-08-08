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
import { useParams } from 'react-router';
import ResourceSlice from '../../../lib/k8s/resourceSlice';
import { DetailsGrid } from '../../common/Resource';
import SectionBox from '../../common/SectionBox';
import SimpleTable from '../../common/SimpleTable';

export default function ResourceSliceDetails() {
  const { name } = useParams<{ name: string }>();
  const { t } = useTranslation('glossary');

  return (
    <DetailsGrid
      resourceType={ResourceSlice}
      name={name}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('Driver'),
            value: item.spec?.driver,
          },
          {
            name: t('Node'),
            value: item.spec?.nodeName,
          },
          {
            name: t('Pool Name'),
            value: item.spec?.pool?.name,
          },
          {
            name: t('Slice Count'),
            value: item.spec?.pool?.resourceSliceCount,
          },
        ]
      }
      extraSections={item =>
        item && item.spec?.devices ? (
          <SectionBox title={t('Devices')}>
            <SimpleTable
              data={item.spec.devices}
              columns={[
                {
                  label: t('Name'),
                  getter: (dev: any) => dev.name,
                },
                {
                  label: t('Capacity'),
                  getter: (dev: any) =>
                    dev.basic?.capacity
                      ? Object.entries(dev.basic.capacity)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(', ')
                      : '',
                },
              ]}
            />
          </SectionBox>
        ) : null
      }
    />
  );
}
