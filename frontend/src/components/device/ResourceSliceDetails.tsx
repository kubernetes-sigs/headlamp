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
import type { CounterSet } from '../../lib/k8s/resourceSlice';
import ResourceSlice from '../../lib/k8s/resourceSlice';
import { DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';
import ResourceSliceDevices, { NameValueLines } from './ResourceSliceDevices';
import ResourceSliceNode from './ResourceSliceNode';

export default function ResourceSliceDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={ResourceSlice}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('glossary|Driver'),
            value: item.driver,
          },
          {
            name: t('translation|Pool'),
            value: item.poolName,
          },
          {
            name: t('translation|Pool Generation'),
            value: item.spec.pool?.generation,
          },
          {
            name: t('translation|Slices in Pool'),
            value: item.spec.pool?.resourceSliceCount,
          },
          {
            name: t('glossary|Node'),
            value: <ResourceSliceNode slice={item} />,
          },
          {
            name: t('translation|Devices'),
            value: item.devices.length,
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.resourceslice-devices',
            section: (
              <SectionBox title={t('translation|Devices')}>
                <ResourceSliceDevices slice={item} />
              </SectionBox>
            ),
          },
          ...(item.sharedCounters.length > 0
            ? [
                {
                  id: 'headlamp.resourceslice-shared-counters',
                  section: (
                    <SectionBox title={t('translation|Shared Counters')}>
                      <SimpleTable
                        columns={[
                          {
                            label: t('translation|Counter Set'),
                            getter: (counterSet: CounterSet) => counterSet.name,
                          },
                          {
                            label: t('translation|Counters'),
                            getter: (counterSet: CounterSet) => (
                              <NameValueLines
                                values={Object.entries(counterSet.counters ?? {}).map(
                                  ([name, counter]) => [name, counter.value]
                                )}
                              />
                            ),
                          },
                        ]}
                        data={item.sharedCounters}
                      />
                    </SectionBox>
                  ),
                },
              ]
            : []),
        ]
      }
    />
  );
}
