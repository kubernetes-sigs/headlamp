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
import type ResourceSlice from '../../lib/k8s/resourceSlice';
import type { ResourceSliceDevice } from '../../lib/k8s/resourceSlice';
import SimpleTable from '../common/SimpleTable';
import { formatTaint } from '../node/utils';
import { formatDeviceAttribute } from './resourceSliceDevice';
import { ResourceSliceDeviceNode } from './ResourceSliceNode';

export function NameValueLines({ values }: { values: [string, string | undefined][] }) {
  return (
    <>
      {[...values]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => (
          <div key={name}>
            {name}: {value}
          </div>
        ))}
    </>
  );
}

export default function ResourceSliceDevices({ slice }: { slice: ResourceSlice }) {
  const { t } = useTranslation(['glossary', 'translation']);
  const hasTaints = slice.devices.some(device => !!device.taints?.length);
  const consumesCounters = slice.devices.some(device => !!device.consumesCounters?.length);

  return (
    <SimpleTable
      columns={[
        {
          label: t('translation|Name'),
          getter: (device: ResourceSliceDevice) => device.name,
        },
        {
          label: t('translation|Attributes'),
          getter: (device: ResourceSliceDevice) => (
            <NameValueLines
              values={Object.entries(device.attributes ?? {}).map(([name, attribute]) => [
                name,
                formatDeviceAttribute(attribute),
              ])}
            />
          ),
        },
        {
          label: t('glossary|Capacity'),
          getter: (device: ResourceSliceDevice) => (
            <NameValueLines
              values={Object.entries(device.capacity ?? {}).map(([name, capacity]) => [
                name,
                capacity.value,
              ])}
            />
          ),
        },
        ...(slice.nodeAccess === 'perDevice'
          ? [
              {
                label: t('glossary|Node'),
                getter: (device: ResourceSliceDevice) => (
                  <ResourceSliceDeviceNode slice={slice} device={device} />
                ),
              },
            ]
          : []),
        ...(consumesCounters
          ? [
              {
                label: t('translation|Consumed Counters'),
                getter: (device: ResourceSliceDevice) =>
                  device.consumesCounters?.map(consumption => (
                    <div key={consumption.counterSet}>
                      <strong>{consumption.counterSet}</strong>
                      <NameValueLines
                        values={Object.entries(consumption.counters ?? {}).map(
                          ([name, counter]) => [name, counter.value]
                        )}
                      />
                    </div>
                  )),
              },
            ]
          : []),
        ...(hasTaints
          ? [
              {
                label: t('translation|Taints'),
                getter: (device: ResourceSliceDevice) =>
                  device.taints?.map(taint => (
                    <div key={`${taint.key}:${taint.effect}`}>{formatTaint(taint)}</div>
                  )),
              },
            ]
          : []),
      ]}
      data={slice.devices}
      emptyMessage={t('translation|This slice publishes no devices.')}
    />
  );
}
