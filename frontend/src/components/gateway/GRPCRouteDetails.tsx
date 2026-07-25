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
import GRPCRoute, { GRPCRouteMatch, GRPCRouteRule } from '../../lib/k8s/grpcRoute';
import EmptyContent from '../common/EmptyContent';
import InnerTable from '../common/InnerTable';
import LabelListItem from '../common/LabelListItem';
import Link from '../common/Link';
import NameValueTable from '../common/NameValueTable';
import { DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import { GatewayParentRefSection } from './utils';

function GRPCRouteRuleTable(props: { rule: GRPCRouteRule; namespace?: string }) {
  const { rule, namespace } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  const mainRows = [
    {
      name: rule.name,
      withHighlightStyle: true,
      hide: rule.name === undefined,
    },
    {
      name: t('translation|Matches'),
      value: <GRPCRuleMatches matches={rule?.matches || []} />,
      valueFullRow: true,
      hide: (rule.matches?.length || 0) === 0,
    },
    {
      name: t('translation|BackendRefs'),
      value: <GRPCRuleBackendRefs backendRefs={rule?.backendRefs || []} namespace={namespace} />,
      valueFullRow: true,
      hide: (rule.backendRefs?.length || 0) === 0,
    },
    {
      name: t('translation|Filters'),
      value: <GRPCRuleFilters filters={rule?.filters || []} />,
      valueFullRow: true,
      hide: (rule.filters?.length || 0) === 0,
    },
  ];
  return <NameValueTable rows={mainRows} />;
}

export interface GRPCRuleMatchesProps {
  matches?: GRPCRouteMatch[];
}

export function GRPCRuleMatches(props: GRPCRuleMatchesProps) {
  const { matches } = props;
  const { t } = useTranslation();
  if (!matches) {
    return null;
  }

  return (
    <InnerTable
      columns={[
        {
          label: t('translation|Match Type'),
          getter: (data: GRPCRouteMatch) => data.method?.type,
        },
        {
          label: t('translation|Service'),
          getter: (data: GRPCRouteMatch) => data.method?.service,
        },
        {
          label: t('translation|Method'),
          getter: (data: GRPCRouteMatch) => data.method?.method,
        },
        {
          label: t('translation|Headers'),
          getter: (data: GRPCRouteMatch) => data.headers?.length,
        },
      ]}
      data={matches}
    />
  );
}

export interface GRPCRuleFiltersProps {
  filters?: {
    type: string;
    [key: string]: any;
  }[];
}

export function GRPCRuleFilters(props: GRPCRuleFiltersProps) {
  const { filters } = props;
  const { t } = useTranslation();
  if (!filters) {
    return null;
  }

  return (
    <InnerTable
      columns={[
        {
          label: t('translation|Filter Type'),
          getter: (data: { type: string }) => data.type,
        },
      ]}
      data={filters}
    />
  );
}

interface GRPCBackendRef {
  group?: string;
  kind?: string;
  name: string;
  namespace?: string;
  port?: number;
  weight?: number;
}

export interface GRPCRuleBackendRefsProps {
  namespace?: string;
  backendRefs?: GRPCBackendRef[];
}

export function GRPCRuleBackendRefs(props: GRPCRuleBackendRefsProps) {
  const { backendRefs, namespace } = props;
  const { t } = useTranslation();
  if (!backendRefs) {
    return null;
  }

  return (
    <InnerTable
      columns={[
        {
          label: t('translation|Name'),
          getter: (data: GRPCBackendRef) => {
            const kind = data.kind ?? 'Service';
            return (
              <Link
                routeName={kind.toLowerCase()}
                params={{ namespace: data?.namespace ?? namespace, name: data.name }}
              >
                {data.name}
              </Link>
            );
          },
        },
        {
          label: t('translation|Namespace'),
          getter: (data: GRPCBackendRef) => data.namespace,
        },
        {
          label: t('translation|Kind'),
          getter: (data: GRPCBackendRef) => data.kind ?? t('translation|Service'),
        },
        {
          label: t('translation|Group'),
          getter: (data: GRPCBackendRef) => data.group,
        },
        {
          label: t('translation|Port'),
          getter: (data: GRPCBackendRef) => data.port,
        },
        {
          label: t('translation|Weight'),
          getter: (data: GRPCBackendRef) => data.weight,
        },
      ]}
      data={backendRefs}
    />
  );
}

export default function GRPCRouteDetails(props: { name?: string; namespace?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={GRPCRoute}
      name={name}
      namespace={namespace}
      extraInfo={grpcRoute =>
        grpcRoute && [
          {
            name: t('Hostnames'),
            value: <LabelListItem labels={grpcRoute.hostnames.map(hostname => `${hostname}`)} />,
            hide: grpcRoute.hostnames.length === 0,
          },
        ]
      }
      withEvents
      extraSections={(item: GRPCRoute) =>
        item && [
          {
            id: 'headlamp.grpcroute-rules',
            section: item && (
              <SectionBox title={t('Rules')}>
                {item.rules.length === 0 ? (
                  <EmptyContent>{t('No data')}</EmptyContent>
                ) : (
                  item.rules.map((rule: GRPCRouteRule, index: number) => (
                    <GRPCRouteRuleTable rule={rule} key={index} namespace={namespace} />
                  ))
                )}
              </SectionBox>
            ),
          },
          {
            id: 'headlamp.grpcroute-parentrefs',
            section: <GatewayParentRefSection parentRefs={item?.parentRefs || []} />,
          },
        ]
      }
    />
  );
}
