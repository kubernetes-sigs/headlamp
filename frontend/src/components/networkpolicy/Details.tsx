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
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { matchExpressionSimplifier, matchLabelsSimplifier } from '../../lib/k8s';
import { LabelSelector } from '../../lib/k8s/cluster';
import NetworkPolicy, {
  NetworkPolicyEgressRule,
  NetworkPolicyIngressRule,
  NetworkPolicyPort,
} from '../../lib/k8s/networkpolicy';
import NameValueTable from '../common/NameValueTable';
import { DetailsGrid } from '../common/Resource';
import { metadataStyles } from '../common/Resource';
import SectionBox from '../common/SectionBox';

export function NetworkPolicyDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  function prepareMatchLabelsAndExpressions(
    matchLabels: LabelSelector['matchLabels'],
    matchExpressions: LabelSelector['matchExpressions']
  ) {
    const matchLabelsSimplified = matchLabelsSimplifier(matchLabels) || [];
    const matchExpressionsSimplified = matchExpressionSimplifier(matchExpressions) || [];

    return (
      <>
        {matchLabelsSimplified.map(label => (
          <Typography sx={metadataStyles} display="inline">
            {label}
          </Typography>
        ))}
        {matchExpressionsSimplified.map(expression => (
          <Typography sx={metadataStyles} display="inline">
            {expression}
          </Typography>
        ))}
      </>
    );
  }

  function PodSelector(props: { networkPolicy: NetworkPolicy }) {
    const { networkPolicy } = props;
    return prepareMatchLabelsAndExpressions(
      networkPolicy.jsonData.spec?.podSelector?.matchLabels,
      networkPolicy.jsonData.spec?.podSelector?.matchExpressions
    );
  }

  function Ingress(props: { ingress: NetworkPolicyIngressRule[] }) {
    const { ingress } = props;

    if (!ingress || ingress.length === 0) {
      return <></>;
    }

    return (
      <>
        {ingress.map((item: NetworkPolicyIngressRule) => (
          <SectionBox title={t('Ingress')}>
            <NameValueTable
              rows={[
                {
                  name: t('Ports'),
                  value: item.ports?.map((port: NetworkPolicyPort) => (
                    <Box>
                      {port.protocol}:{port.port}
                    </Box>
                  )),
                },
                {
                  name: t('translation|From'),
                  value: '',
                },
                {
                  name: t('ipBlock'),
                  value: item.from?.map(from => {
                    if (!from.ipBlock) {
                      return <></>;
                    }
                    const { cidr, except = [] } = from.ipBlock || {};
                    if (!cidr) {
                      return <></>;
                    }
                    if (cidr && except.length === 0) {
                      return <>{`cidr: ${cidr}`}</>;
                    }
                    return <>{`cidr: ${cidr}, except: ${except.join(', ')}`}</>;
                  }),
                },
                {
                  name: t('namespaceSelector'),
                  value: item.from?.map(from => {
                    if (!from.namespaceSelector) {
                      return <></>;
                    }
                    const { matchLabels = {}, matchExpressions = [] } =
                      from.namespaceSelector || {};
                    return prepareMatchLabelsAndExpressions(matchLabels, matchExpressions);
                  }),
                },
                {
                  name: t('podSelector'),
                  value: item.from?.map(from => {
                    if (!from.podSelector) {
                      return <></>;
                    }
                    const { matchLabels = {}, matchExpressions = [] } = from.podSelector || {};
                    return prepareMatchLabelsAndExpressions(matchLabels, matchExpressions);
                  }),
                },
              ]}
            />
          </SectionBox>
        ))}
      </>
    );
  }

  function Egress(props: { egress: NetworkPolicyEgressRule[] }) {
    const { egress } = props;
    if (!egress || egress.length === 0) {
      return <></>;
    }
    return (
      <>
        {egress.map((item: NetworkPolicyEgressRule) => (
          <SectionBox title={t('Egress')}>
            <NameValueTable
              rows={[
                {
                  name: t('Ports'),
                  value: item.ports?.map((port: NetworkPolicyPort) => (
                    <Box>
                      {port.protocol}:{port.port}
                    </Box>
                  )),
                },
                {
                  name: t('translation|To'),
                  value: '',
                },
                {
                  name: t('ipBlock'),
                  value: item.to?.map(to => {
                    const { cidr, except = [] } = to.ipBlock || {};
                    if (!cidr) {
                      return <></>;
                    }
                    if (cidr && except.length === 0) {
                      return <>{`cidr: ${cidr}`}</>;
                    }
                    return (
                      <>{`cidr: ${cidr}, ${t('except: {{ cidrExceptions }}', {
                        cidrExceptions: except.join(', '),
                      })}`}</>
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

  return (
    <DetailsGrid
      resourceType={NetworkPolicy}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('Pod Selector'),
            value: <PodSelector networkPolicy={item} />,
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'networkpolicy-ingress',
            section: <Ingress ingress={item.jsonData.spec.ingress} />,
          },
          {
            id: 'networkpolicy-egress',
            section: <Egress egress={item.jsonData.spec.egress} />,
          },
        ]
      }
    />
  );
}
