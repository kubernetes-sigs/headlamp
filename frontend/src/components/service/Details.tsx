import { InlineIcon } from '@iconify/react';
import { Box } from '@mui/material';
import _ from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import Endpoint from '../../lib/k8s/endpoints';
import Service from '../../lib/k8s/service';
import { Link } from '../common';
import Empty from '../common/EmptyContent';
import { ValueLabel } from '../common/Label';
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

  const [endpoints, endpointsError] = Endpoint.useList({ namespace });

  function getOwnedEndpoints(item: Service) {
    return item ? endpoints?.filter(endpoint => endpoint.getName() === item.getName()) : null;
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
            name: t('External IP'),
            value: item.getExternalAddresses(),
            hide: _.isEmpty,
          },
          {
            name: t('Selector'),
            value: <MetadataDictGrid dict={item.spec.selector} />,
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.service-ports',
            section: (
              <SectionBox title={t('Ports')}>
                <SimpleTable
                  data={item.spec.ports}
                  columns={[
                    {
                      label: t('Protocol'),
                      datum: 'protocol',
                    },
                    {
                      label: t('translation|Name'),
                      datum: 'name',
                    },
                    {
                      label: t('Ports'),
                      getter: ({ port, targetPort }) => (
                        <React.Fragment>
                          <ValueLabel>{port}</ValueLabel>
                          <InlineIcon icon="mdi:chevron-right" />
                          <ValueLabel>{targetPort}</ValueLabel>
                          <PortForward containerPort={targetPort} resource={item} />
                        </React.Fragment>
                      ),
                    },
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
                            {endpoint.getAddresses().map((address: string) => (
                              <ValueLabel>{address}</ValueLabel>
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
        ]
      }
    />
  );
}
