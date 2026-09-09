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
import { GatewayL4RouteRule } from '../../lib/k8s/gateway';
import EmptyContent from '../common/EmptyContent';
import NameValueTable from '../common/NameValueTable';
import { DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import { GatewayL4Route, GatewayL4RouteClass } from './L4RouteList';
import {
  GatewayBackendRefTable,
  GatewayParentRefSection,
  GatewayParentStatusSection,
} from './utils';

export interface L4RouteDetailsProps {
  resourceClass: GatewayL4RouteClass;
  name?: string;
  namespace?: string;
  cluster?: string;
}

function L4RouteRuleTable(props: {
  rule: GatewayL4RouteRule;
  namespace?: string;
  cluster?: string;
}) {
  const { rule, namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <NameValueTable
      rows={[
        {
          name: rule.name,
          withHighlightStyle: true,
          hide: rule.name === undefined,
        },
        {
          name: t('translation|BackendRefs'),
          value: (
            <GatewayBackendRefTable
              backendRefs={rule.backendRefs || []}
              namespace={namespace}
              cluster={cluster}
            />
          ),
          valueFullRow: true,
        },
      ]}
    />
  );
}

export default function L4RouteDetails(props: L4RouteDetailsProps) {
  const params = useParams<{ namespace: string; name: string }>();
  const { resourceClass, name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={resourceClass}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      noDefaultActions
      extraSections={(item: GatewayL4Route) =>
        item && [
          {
            id: `headlamp.${resourceClass.kind.toLowerCase()}-rules`,
            section: (
              <SectionBox title={t('glossary|Rules')}>
                {item.rules.length === 0 ? (
                  <EmptyContent>{t('translation|No data')}</EmptyContent>
                ) : (
                  item.rules.map((rule, index) => (
                    <L4RouteRuleTable
                      rule={rule}
                      namespace={namespace}
                      cluster={item.cluster ?? cluster}
                      key={index}
                    />
                  ))
                )}
              </SectionBox>
            ),
          },
          {
            id: `headlamp.${resourceClass.kind.toLowerCase()}-parentrefs`,
            section: (
              <GatewayParentRefSection
                parentRefs={item.parentRefs || []}
                namespace={namespace}
                cluster={item.cluster ?? cluster}
              />
            ),
          },
          {
            id: `headlamp.${resourceClass.kind.toLowerCase()}-parent-status`,
            section: (
              <GatewayParentStatusSection
                parents={item.parents || []}
                namespace={namespace}
                cluster={item.cluster ?? cluster}
              />
            ),
          },
        ]
      }
    />
  );
}
