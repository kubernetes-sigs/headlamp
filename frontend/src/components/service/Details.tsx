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

import { InlineIcon } from '@iconify/react';
import Box from '@mui/material/Box';
import _ from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import Endpoint from '../../lib/k8s/endpoints';
import EndpointSlice from '../../lib/k8s/endpointSlices';
import Service, { KubeServicePort } from '../../lib/k8s/service';
import Empty from '../common/EmptyContent';
import { ValueLabel } from '../common/Label';
import Link from '../common/Link';
import { DetailsGrid, MetadataDictGrid } from '../common/Resource';
import PortForward from '../common/Resource/PortForward';
import { SectionBox } from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

export default function ServiceDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  const [endpoints, endpointsError] = Endpoint.useList({ namespace, cluster });
  const [endpointSlices, endpointSlicesError] = EndpointSlice.useList({ namespace, cluster });

  function getOwnedEndpoints(item: Service) {
    return item ? endpoints?.filter(endpoint => endpoint.getName() === item.getName()) : null;
  }
  function getOwnedEndpointSlices(item: Service) {
    return item
      ? endpointSlices?.filter(
          endpointSlice => endpointSlice.getOwnerServiceName() === item.getName()
        )
      : null;
  }

  return (
    <DetailsGrid
      resourceType={Service}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Type'),
            value: item.spec.type,
          },
          {
            name: t('Cluster IP'),
            value: item.spec.clusterIP,
          },
          {
            name: t('Cluster IPs'),
            value: item.spec.clusterIPs?.join(', '),
            // Hide when redundant with the Cluster IP row above (single entry, same value).
            hide:
              !item.spec.clusterIPs?.length ||
              _.isEqual(item.spec.clusterIPs, [item.spec.clusterIP]),
          },
          {
            name: t('External IP'),
            value: item.getExternalAddresses(),
            hide: _.isEmpty,
          },
          {
            name: t('External Name'),
            value: item.spec.externalName,
            hide: _.isEmpty,
          },
          {
            name: t('IP Families'),
            value: item.spec.ipFamilies?.join(', '),
            hide: _.isEmpty,
          },
          {
            name: t('IP Family Policy'),
            value: item.spec.ipFamilyPolicy,
            hide: _.isEmpty,
          },
          {
            name: t('Session Affinity'),
            value:
              item.spec.sessionAffinity === 'ClientIP' &&
              item.spec.sessionAffinityConfig?.clientIP?.timeoutSeconds
                ? `${item.spec.sessionAffinity} (${item.spec.sessionAffinityConfig.clientIP.timeoutSeconds}s)`
                : item.spec.sessionAffinity,
            // Match kubectl describe: skip the row for the default 'None' affinity.
            hide: !item.spec.sessionAffinity || item.spec.sessionAffinity === 'None',
          },
          {
            name: t('External Traffic Policy'),
            value: item.spec.externalTrafficPolicy,
            hide: _.isEmpty,
          },
          {
            name: t('Internal Traffic Policy'),
            value: item.spec.internalTrafficPolicy,
            hide: _.isEmpty,
          },
          {
            name: t('Health Check Node Port'),
            value: item.spec.healthCheckNodePort,
            hide: value => !value,
          },
          {
            name: t('Load Balancer Class'),
            value: item.spec.loadBalancerClass,
            hide: _.isEmpty,
          },
          {
            name: t('Load Balancer Source Ranges'),
            value: item.spec.loadBalancerSourceRanges?.join(', '),
            hide: _.isEmpty,
          },
          {
            name: t('Traffic Distribution'),
            value: item.spec.trafficDistribution,
            hide: _.isEmpty,
          },
          {
            name: t('Selector'),
            value: <MetadataDictGrid dict={item.spec.selector} />,
          },
        ]
      }
      extraSections={item => {
        if (!item) {
          return [];
        }

        return [
          {
            id: 'headlamp.service-ports',
            section: (
              <SectionBox title={t('Ports')}>
                <SimpleTable
                  data={item.spec.ports}
                  columns={[
                    { label: t('Protocol'), datum: 'protocol' },
                    { label: t('translation|Name'), datum: 'name' },
                    {
                      label: t('Ports'),
                      getter: ({ port, targetPort }) => (
                        <>
                          <ValueLabel>{port}</ValueLabel>
                          <InlineIcon icon="mdi:chevron-right" />
                          <ValueLabel>{targetPort}</ValueLabel>
                          <PortForward containerPort={targetPort} resource={item} />
                        </>
                      ),
                    },
                    ...(item.spec.ports?.some(p => p.nodePort)
                      ? [
                          {
                            label: t('Node Port'),
                            getter: ({ nodePort }: KubeServicePort) =>
                              nodePort ? <ValueLabel>{nodePort}</ValueLabel> : '-',
                          },
                        ]
                      : []),
                    ...(item.spec.ports?.some(p => p.appProtocol)
                      ? [
                          {
                            label: t('App Protocol'),
                            getter: ({ appProtocol }: KubeServicePort) => appProtocol ?? '-',
                          },
                        ]
                      : []),
                  ]}
                  reflectInURL="ports"
                />
              </SectionBox>
            ),
          },

          {
            id: 'headlamp.service-endpoints',
            section: (
              <SectionBox title={t('Endpoints')}>
                {endpointsError ? (
                  <Empty color="error">{endpointsError.toString()}</Empty>
                ) : (
                  <SimpleTable
                    data={getOwnedEndpoints(item) ?? null}
                    columns={[
                      {
                        label: t('translation|Name'),
                        getter: endpoint => <Link kubeObject={endpoint} />,
                      },
                      {
                        label: t('translation|Addresses'),
                        getter: endpoint => (
                          <Box display="flex" flexDirection="column">
                            {endpoint.getAddresses().map((address: string, index: number) => (
                              <ValueLabel key={index}>{address}</ValueLabel>
                            ))}
                          </Box>
                        ),
                      },
                    ]}
                    reflectInURL="endpoints"
                  />
                )}
              </SectionBox>
            ),
          },

          {
            id: 'headlamp.service-endpointslices',
            section: (
              <SectionBox title={t('Endpoint Slices')}>
                {endpointSlicesError ? (
                  <Empty color="error">{endpointSlicesError.toString()}</Empty>
                ) : (
                  <SimpleTable
                    data={getOwnedEndpointSlices(item) ?? null}
                    columns={[
                      {
                        label: t('translation|Name'),
                        getter: endpointSlice => <Link kubeObject={endpointSlice} />,
                      },
                      {
                        label: t('translation|Addresses'),
                        getter: endpointSlice => (
                          <Box display="flex" flexDirection="column">
                            {endpointSlice.spec.endpoints.map((ep: any, index: number) => (
                              <ValueLabel key={index}>{ep.addresses.join(',')}</ValueLabel>
                            ))}
                          </Box>
                        ),
                      },
                      {
                        label: t('Ports'),
                        getter: endpoint => endpoint.ports?.join(', ') ?? '',
                      },
                      {
                        label: t('translation|Address Type'),
                        getter: endpoint => endpoint?.spec?.addressType ?? '',
                      },
                    ]}
                    reflectInURL="endpoints"
                  />
                )}
              </SectionBox>
            ),
          },
        ];
      }}
    />
  );
}
