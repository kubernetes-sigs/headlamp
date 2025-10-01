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
import HTTPRoute, { HTTPRouteRule } from '../../lib/k8s/httpRoute';
import EmptyContent from '../common/EmptyContent';
import InnerTable from '../common/InnerTable';
import LabelListItem from '../common/LabelListItem';
import Link from '../common/Link';
import NameValueTable from '../common/NameValueTable';
import { DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import { GatewayParentRefSection } from './utils';

function HTTPRouteRuleTable(props: { rule: HTTPRouteRule; namespace?: string }) {
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
      value: <RuleMatches matches={rule?.matches || []} />,
      valueFullRow: true,
      hide: (rule.matches?.length || 0) === 0,
    },
    {
      name: t('translation|BackendRefs'),
      value: <RuleBackendRefs backendRefs={rule?.backendRefs || []} namespace={namespace} />,
      valueFullRow: true,
      hide: (rule.backendRefs?.length || 0) === 0,
    },
    {
      name: t('translation|Filters'),
      value: <RuleFilters filters={rule?.filters || []} />,
      valueFullRow: true,
      hide: (rule.filters?.length || 0) === 0,
    },
  ];
  return <NameValueTable rows={mainRows} />;
}

export interface RuleMatchesProps {
  matches?: {
    path: {
      type?: string;
      value: string;
    };
    headers?: any[];
    queryParams?: any[];
    method?: string;
  }[];
}

export function RuleMatches(props: RuleMatchesProps) {
  const { matches } = props;
  const { t } = useTranslation();
  if (!matches) {
    return null;
  }

  return (
    <InnerTable
      columns={[
        {
          label: t('translation|Path Type'),
          getter: (data: any) => data.path?.type,
        },
        {
          label: t('translation|Path'),
          getter: (data: any) => data.path.value,
        },
        {
          label: t('translation|Headers'),
          getter: (data: any) => data.headers?.length,
        },
        {
          label: t('translation|Query Parameters'),
          getter: (data: any) => data.queryParams?.length,
        },
        {
          label: t('translation|Method'),
          getter: (data: any) => data.method,
        },
      ]}
      data={matches}
    />
  );
}

export interface RuleFiltersProps {
  filters?: {
    type: string;
    [key: string]: any;
  }[];
}

export function RuleFilters(props: RuleFiltersProps) {
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
          getter: (data: any) => data.type,
        },
      ]}
      data={filters}
    />
  );
}

export interface RuleBackendRefsProps {
  namespace?: string;
  backendRefs?: {
    group?: string;
    kind?: string;
    name: string;
    namespace?: string;
    port?: string;
    weight?: number;
  }[];
}

export function RuleBackendRefs(props: RuleBackendRefsProps) {
  const { backendRefs, namespace } = props;
  const { t } = useTranslation();
  if (!backendRefs) {
    return null;
  }
  console.log(namespace, backendRefs);
  return (
    <InnerTable
      columns={[
        {
          label: t('translation|Name'),
          getter: (data: any) => (
            <Link
              routeName={data.kind?.toLowerCase()}
              params={{ namespace: data?.namespace ?? namespace, name: data.name }}
            >
              {data.name}
            </Link>
          ),
        },
        {
          label: t('translation|Namespace'),
          getter: (data: any) => data.namespace,
        },
        {
          label: t('translation|Kind'),
          getter: (data: any) => data.kind,
        },
        {
          label: t('translation|Group'),
          getter: (data: any) => data.group,
        },
        {
          label: t('translation|Port'),
          getter: (data: any) => data.port,
        },
        {
          label: t('translation|Weight'),
          getter: (data: any) => data.weight,
        },
      ]}
      data={backendRefs}
    />
  );
}

export default function HTTPRouteDetails(props: { name?: string; namespace?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={HTTPRoute}
      name={name}
      namespace={namespace}
      extraInfo={httpRoute =>
        httpRoute && [
          {
            name: 'Hostnames',
            value: <LabelListItem labels={httpRoute.hostnames.map(tls => `${tls}`)} />,
          },
        ]
      }
      withEvents
      extraSections={(item: HTTPRoute) =>
        item && [
          {
            id: 'headlamp.httproute-rules',
            section: item && (
              <SectionBox title={t('Rules')}>
                {item.rules.length === 0 ? (
                  <EmptyContent>{t('No data')}</EmptyContent>
                ) : (
                  item.rules.map((rule: HTTPRouteRule, index: any) => (
                    <HTTPRouteRuleTable rule={rule} key={index} namespace={namespace} />
                  ))
                )}
              </SectionBox>
            ),
          },
          {
            id: 'headlamp.httproute-parentrefs',
            section: <GatewayParentRefSection parentRefs={item?.parentRefs || []} />,
          },
        ]
      }
    />
  );
}
