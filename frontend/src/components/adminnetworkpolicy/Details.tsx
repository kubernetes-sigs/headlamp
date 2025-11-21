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
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { matchLabelsSimplifier } from '../../lib/k8s';
import AdminNetworkPolicy, {
  AdminNetworkPolicyEgressRule,
  AdminNetworkPolicyIngressRule,
  AdminNetworkPolicyPort,
} from '../../lib/k8s/adminnetworkpolicy';
import NameValueTable from '../common/NameValueTable';
import { DetailsGrid, MetadataDictGrid } from '../common/Resource';
import { metadataStyles } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import { KubeIcon } from '../resourceMap/kubeIcon/KubeIcon';

export default function AdminNetworkPolicyDetails(props: {
  name?: string;
  cluster?: string;
  subject?: string;
}) {
  const params = useParams<{ subject: string; name: string }>();
  const { name = params.name, subject = params.subject, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  function SubjectSelector(props: { AdminNetworkPolicy: AdminNetworkPolicy }) {
    const { AdminNetworkPolicy } = props;
    // this is an exception which should never happen, but we handle it gracefully
    if (
      AdminNetworkPolicy.jsonData?.spec?.subject?.pods === undefined &&
      AdminNetworkPolicy.jsonData?.spec?.subject?.namespaces === undefined
    ) {
      return <></>;
    }

    if (AdminNetworkPolicy.jsonData?.spec?.subject?.pods !== undefined) {
      return (
        <>
          <KubeIcon kind="Namespace" width="30px" height="30px" />
          <Tooltip title="namespaceSelector">
            {(() => {
              const labels = matchLabelsSimplifier(
                AdminNetworkPolicy.jsonData?.spec?.subject?.pods?.namespaceSelector?.matchLabels
              );
              return Array.isArray(labels) ? (
                <>
                  {labels.map((label: string) => (
                    <Typography sx={metadataStyles} display="inline" key={label}>
                      {label}
                    </Typography>
                  ))}
                </>
              ) : (
                <Typography sx={metadataStyles} display="inline">
                  All Namespaces
                </Typography>
              );
            })()}
          </Tooltip>
          <KubeIcon kind="Pod" width="30px" height="30px" />
          <Tooltip title="podSelector">
            {(() => {
              const labels = matchLabelsSimplifier(
                AdminNetworkPolicy.jsonData?.spec?.subject?.pods?.podSelector?.matchLabels
              );
              return Array.isArray(labels) ? (
                <>
                  {labels.map((label: string) => (
                    <Typography sx={metadataStyles} display="inline" key={label}>
                      {label}
                    </Typography>
                  ))}
                </>
              ) : (
                <Typography sx={metadataStyles} display="inline">
                  All Pods
                </Typography>
              );
            })()}
          </Tooltip>
        </>
      );
    }

    if (AdminNetworkPolicy.jsonData?.spec?.subject?.namespaces !== undefined) {
      return (
        <>
          <Typography sx={metadataStyles} display="inline">
            {(() => {
              const labels = matchLabelsSimplifier(
                AdminNetworkPolicy.jsonData?.spec?.subject?.namespaces?.namespaceSelector
                  ?.matchLabels
              );
              return Array.isArray(labels) ? (
                <>
                  {labels.map((label: string) => (
                    <Typography sx={metadataStyles} display="inline" key={label}>
                      {label}
                    </Typography>
                  ))}
                </>
              ) : (
                <Typography sx={metadataStyles} display="inline">
                  All Pods
                </Typography>
              );
            })()}
          </Typography>
        </>
      );
    }
  }

  function Ingress(props: { ingress: AdminNetworkPolicyIngressRule[] }) {
    const { ingress } = props;

    if (!ingress || ingress.length === 0) {
      return <></>;
    }

    return (
      <>
        {ingress.map((item: AdminNetworkPolicyIngressRule, index: number) => (
          <SectionBox key={`ingress-${index}`} title={t('Ingress')}>
            <NameValueTable
              rows={[
                {
                  name: t('Name'),
                  value: item.name || <Box sx={metadataStyles}>-</Box>,
                },
                {
                  name: t('translation|Action'),
                  value: (
                    <>
                      <span color="success">{item.action}</span>
                    </>
                  ),
                },
                {
                  name: t('Ports'),
                  value: item.ports?.map((ports: AdminNetworkPolicyPort) => {
                    if (!ports.portNumber) {
                      return <></>;
                    }
                    if (ports.portNumber) {
                      return (
                        <>
                          {' '}
                          {ports.portNumber.protocol}:{ports.portNumber.port}{' '}
                        </>
                      );
                    }
                  }),
                },
                {
                  name: t('translation|From'),
                  value: item.from?.map(from => {
                    if (!from.pods && !from.namespaces) {
                      return <></>;
                    }
                    return (
                      <>
                        {from.pods ? (
                          <>
                            Pods:
                            {Object.keys(from.pods.namespaceSelector?.matchLabels || {}).length ===
                              0 &&
                            Object.keys(from.pods.podSelector?.matchLabels || {}).length === 0 ? (
                              <Typography sx={metadataStyles} display="inline">
                                All Pods
                              </Typography>
                            ) : (
                              <>
                                <MetadataDictGrid dict={from.pods.namespaceSelector?.matchLabels} />
                                <MetadataDictGrid dict={from.pods.podSelector?.matchLabels} />
                              </>
                            )}
                          </>
                        ) : null}

                        {from.namespaces ? (
                          <>
                            Namespaces:
                            {Object.keys(from.namespaces.matchLabels || {}).length === 0 ? (
                              <Typography sx={metadataStyles} display="inline">
                                All Namespaces
                              </Typography>
                            ) : (
                              <MetadataDictGrid dict={from.namespaces.matchLabels} />
                            )}
                          </>
                        ) : null}
                      </>
                    );
                  }),
                },
              ]}
            />
          </SectionBox>
        ))}
      </>
    );
  }

  function Egress(props: { egress: AdminNetworkPolicyEgressRule[] }) {
    const { egress } = props;
    if (!egress || egress.length === 0) {
      return <></>;
    }
    return (
      <>
        {egress.map((item: AdminNetworkPolicyEgressRule, index: number) => (
          <SectionBox key={`egress-${index}`} title={t('Egress')}>
            <NameValueTable
              rows={[
                {
                  name: t('Name'),
                  value: item.name || <Box sx={metadataStyles}>-</Box>,
                },
                {
                  name: t('translation|Action'),
                  value: item.action,
                },
                {
                  name: t('translation|To'),
                  value: item.to?.map(to => {
                    if (
                      !to.pods &&
                      !to.namespaces &&
                      !to.nodes &&
                      !to.networks &&
                      !to.domainNames
                    ) {
                      return <></>;
                    }
                    // return <MetadataDictGrid dict={to.pods?.namespaceSelector?.matchLabels} />
                    return (
                      <>
                        {to.pods ? (
                          <>
                            Pods:
                            {Object.keys(to.pods.namespaceSelector?.matchLabels || {}).length ===
                              0 &&
                            Object.keys(to.pods.podSelector?.matchLabels || {}).length === 0 ? (
                              <Typography sx={metadataStyles} display="inline">
                                All Pods
                              </Typography>
                            ) : (
                              <>
                                <MetadataDictGrid dict={to.pods.namespaceSelector?.matchLabels} />
                                <MetadataDictGrid dict={to.pods.podSelector?.matchLabels} />
                              </>
                            )}
                          </>
                        ) : null}

                        {to.namespaces ? (
                          <>
                            Namespaces:
                            {Object.keys(to.namespaces.matchLabels || {}).length === 0 ? (
                              <Typography sx={metadataStyles} display="inline">
                                All Namespaces
                              </Typography>
                            ) : (
                              <MetadataDictGrid dict={to.namespaces.matchLabels} />
                            )}
                          </>
                        ) : null}
                      </>
                    );
                  }),
                },
                {
                  name: t('Ports'),
                  value: item.ports?.map((ports: AdminNetworkPolicyPort) => {
                    if (!ports.portNumber) {
                      return <></>;
                    }
                    if (ports.portNumber) {
                      return (
                        <>
                          {' '}
                          {ports.portNumber.protocol}:{ports.portNumber.port}{' '}
                        </>
                      );
                    }
                  }),
                },
              ]}
            />
          </SectionBox>
        ))}
      </>
    );
  }

  return (
    <DetailsGrid
      resourceType={AdminNetworkPolicy}
      name={name}
      subject={subject}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('Subject Selector'),
            value: <SubjectSelector AdminNetworkPolicy={item} />,
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'adminnetworkpolicy-ingress',
            section: <Ingress ingress={item.jsonData.spec.ingress} />,
          },
          {
            id: 'adminnetworkpolicy-egress',
            section: <Egress egress={item.jsonData.spec.egress} />,
          },
        ]
      }
    />
  );
}
