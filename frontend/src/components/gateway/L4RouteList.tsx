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

import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GatewayL4RouteRule,
  GatewayParentReference,
  GatewayRouteParentStatus,
  KubeGatewayL4Route,
} from '../../lib/k8s/gateway';
import { KubeObject, KubeObjectClass } from '../../lib/k8s/KubeObject';
import ResourceListView from '../common/Resource/ResourceListView';

export type GatewayL4Route = KubeObject<KubeGatewayL4Route> & {
  rules: GatewayL4RouteRule[];
  parentRefs: GatewayParentReference[];
  parents: GatewayRouteParentStatus[];
};

export type GatewayL4RouteClass = KubeObjectClass & {
  new (json: KubeGatewayL4Route, cluster?: string): GatewayL4Route;
};

export interface L4RouteListProps {
  resourceClass: GatewayL4RouteClass;
  title: ReactNode;
}

export default function L4RouteList(props: L4RouteListProps) {
  const { resourceClass, title } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={title}
      resourceClass={resourceClass}
      headerProps={{ titleSideActions: [] }}
      enableRowActions={false}
      enableRowSelection={false}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'rules',
          label: t('glossary|Rules'),
          getValue: (route: GatewayL4Route) => route.rules.length,
        },
        'labels',
        'age',
      ]}
    />
  );
}
