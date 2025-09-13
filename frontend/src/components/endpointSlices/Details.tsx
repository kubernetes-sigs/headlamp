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

import Box from '@mui/material/Box';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import EndpointSlice from '../../lib/k8s/endpointSlices';
import { SectionBox, SimpleTable, StatusLabel } from '../common';
import { DetailsGrid } from '../common/Resource';

export default function EndpointSliceDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={EndpointSlice}
      name={name}
      namespace={namespace}
      cluster={cluster}
      title={t('Endpoint Slice')}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Address Type'),
            value: item.spec.addressType,
          },
        ]
      }
      extraSections={(item: EndpointSlice) =>
        item && [
          {
            id: 'headlamp.endpoint-slice-endpoints',
            section: (
              <SectionBox title={t('Endpoints')}>
                <SimpleTable
                  data={item?.spec.endpoints || []}
                  columns={[
                    {
                      label: t('translation|Hostname'),
                      datum: 'hostname',
                      sort: true,
                    },
                    {
                      label: t('translation|Node Name'),
                      datum: 'nodeName',
                      sort: true,
                    },
                    {
                      label: t('translation|Zone'),
                      datum: 'zone',
                      sort: true,
                    },
                    {
                      label: t('Addresses'),
                      getter: endpoint => endpoint.addresses?.join(','),
                    },
                    {
                      label: t('Conditions'),
                      getter: endpoint => (
                        <>
                          <Box display="inline-block">
                            <StatusLabel status={endpoint.conditions.ready ? 'success' : 'error'}>
                              {t('Ready')}
                            </StatusLabel>
                          </Box>
                          <Box display="inline-block">
                            <StatusLabel status={endpoint.conditions.serving ? 'success' : 'error'}>
                              {t('Serving')}
                            </StatusLabel>
                          </Box>
                          <Box display="inline-block">
                            <StatusLabel
                              status={endpoint.conditions.terminating ? 'success' : 'error'}
                            >
                              {t('Terminating')}
                            </StatusLabel>
                          </Box>
                        </>
                      ),
                    },
                  ]}
                  defaultSortingColumn={1}
                  reflectInURL="endpoints"
                />
              </SectionBox>
            ),
          },
          {
            id: 'headlamp.endpoint-slice-ports',
            section: (
              <SectionBox title={t('Ports')}>
                <SimpleTable
                  data={item?.spec.ports || []}
                  columns={[
                    {
                      label: t('translation|Name'),
                      datum: 'name',
                      sort: true,
                    },
                    {
                      label: t('Port'),
                      datum: 'port',
                      sort: true,
                    },
                    {
                      label: t('Protocol'),
                      datum: 'protocol',
                      sort: true,
                    },
                  ]}
                  defaultSortingColumn={1}
                  reflectInURL="ports"
                />
              </SectionBox>
            ),
          },
        ]
      }
    />
  );
}
