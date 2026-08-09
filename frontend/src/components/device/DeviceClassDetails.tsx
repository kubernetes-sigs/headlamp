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
import DeviceClass from '../../lib/k8s/deviceClass';
import { DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

export default function DeviceClassDetails() {
  const { name } = useParams<{ name: string }>();
  const { t } = useTranslation(['translation', 'glossary']);

  return (
    <DetailsGrid
      resourceType={DeviceClass}
      name={name}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('Selectors'),
            value: item.spec?.selectors?.map((s: any, i: number) => (
              <div key={i}>{s.cel?.expression}</div>
            )),
          },
        ]
      }
      extraSections={item =>
        item && item.spec?.config
          ? [
              <SectionBox key="config" title={t('Config')}>
                <SimpleTable
                  data={item.spec.config}
                  columns={[
                    {
                      label: t('Driver'),
                      getter: (config: any) => config.opaque?.driver,
                    },
                    {
                      label: t('Parameters'),
                      getter: (config: any) =>
                        config.opaque?.parameters ? JSON.stringify(config.opaque.parameters) : '',
                    },
                  ]}
                />
              </SectionBox>,
            ]
          : []
      }
    />
  );
}
