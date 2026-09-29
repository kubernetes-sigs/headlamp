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
import type {
  GatewayBackendReference,
  GatewayParentReference,
  GatewayRouteParentStatus,
} from '../../lib/k8s/gateway';
import {
  GATEWAY_API_GROUP,
  type ResolvedGatewayBackendReference,
  type ResolvedGatewayParentReference,
  resolveGatewayBackendReference,
  resolveGatewayParentReference,
} from '../../lib/k8s/gatewayReferences';
import { ConditionList } from '../common/ConditionList';
import EmptyContent from '../common/EmptyContent';
import InnerTable from '../common/InnerTable';
import Link from '../common/Link';
import NameValueTable from '../common/NameValueTable';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

function GatewayParentReferenceName(props: {
  reference: ResolvedGatewayParentReference;
  cluster?: string;
}) {
  const { reference, cluster } = props;

  if (reference.group === GATEWAY_API_GROUP && reference.kind === 'Gateway') {
    return (
      <Link
        routeName="gateway"
        params={{ namespace: reference.namespace, name: reference.name }}
        activeCluster={cluster}
      >
        {reference.name}
      </Link>
    );
  }

  return <>{reference.name}</>;
}

function GatewayBackendReferenceName(props: {
  reference: ResolvedGatewayBackendReference;
  cluster?: string;
}) {
  const { reference, cluster } = props;

  if (reference.group === '' && reference.kind === 'Service') {
    return (
      <Link
        routeName="service"
        params={{ namespace: reference.namespace, name: reference.name }}
        activeCluster={cluster}
      >
        {reference.name}
      </Link>
    );
  }

  return <>{reference.name}</>;
}

export function GatewayBackendRefTable(props: {
  backendRefs: GatewayBackendReference[];
  namespace?: string;
  cluster?: string;
}) {
  const { backendRefs, namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);
  const references = backendRefs.map(ref => resolveGatewayBackendReference(ref, namespace));

  return (
    <InnerTable
      columns={[
        {
          label: t('translation|Name'),
          getter: (data: ResolvedGatewayBackendReference) => (
            <GatewayBackendReferenceName reference={data} cluster={cluster} />
          ),
        },
        {
          label: t('translation|Namespace'),
          getter: (data: ResolvedGatewayBackendReference) => data.namespace,
        },
        {
          label: t('translation|Kind'),
          getter: (data: ResolvedGatewayBackendReference) => data.kind,
        },
        {
          label: t('translation|Group'),
          getter: (data: ResolvedGatewayBackendReference) => data.group,
        },
        {
          label: t('translation|Port'),
          getter: (data: ResolvedGatewayBackendReference) => data.port,
        },
        {
          label: t('translation|Weight'),
          getter: (data: ResolvedGatewayBackendReference) => data.weight,
        },
      ]}
      data={references}
    />
  );
}

export function GatewayParentRefSection(props: {
  parentRefs: GatewayParentReference[];
  namespace?: string;
  cluster?: string;
}) {
  const { parentRefs, namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);
  const references = parentRefs.map(ref => resolveGatewayParentReference(ref, namespace));

  return (
    <SectionBox title={t('translation|ParentRefs')}>
      <SimpleTable
        emptyMessage={t('translation|No rules data to be shown.')}
        columns={[
          {
            label: t('translation|Name'),
            getter: (data: ResolvedGatewayParentReference) => (
              <GatewayParentReferenceName reference={data} cluster={cluster} />
            ),
          },
          {
            label: t('translation|Namespace'),
            getter: (data: ResolvedGatewayParentReference) => data.namespace,
          },
          {
            label: t('translation|Kind'),
            getter: (data: ResolvedGatewayParentReference) => data.kind,
          },
          {
            label: t('translation|Group'),
            getter: (data: ResolvedGatewayParentReference) => data.group,
          },
          {
            label: t('translation|Section Name'),
            getter: (data: ResolvedGatewayParentReference) => data.sectionName,
          },
          {
            label: t('translation|Port'),
            getter: (data: ResolvedGatewayParentReference) => data.port,
          },
        ]}
        data={references}
        reflectInURL="parentRefs"
      />
    </SectionBox>
  );
}

export function GatewayParentStatusSection(props: {
  parents: GatewayRouteParentStatus[];
  namespace?: string;
  cluster?: string;
}) {
  const { parents, namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <SectionBox title={t('translation|Parent Status')}>
      {parents.length === 0 ? (
        <EmptyContent>{t('translation|No data')}</EmptyContent>
      ) : (
        parents.map((parent, index) => {
          const reference = resolveGatewayParentReference(parent.parentRef, namespace);

          return (
            <NameValueTable
              key={`${reference.group}/${reference.kind}/${reference.namespace}/${reference.name}/${index}`}
              rows={[
                {
                  name: <GatewayParentReferenceName reference={reference} cluster={cluster} />,
                  withHighlightStyle: true,
                },
                {
                  name: t('translation|Namespace'),
                  value: reference.namespace,
                },
                {
                  name: t('translation|Kind'),
                  value: reference.kind,
                },
                {
                  name: t('translation|Group'),
                  value: reference.group,
                },
                {
                  name: t('glossary|Controller'),
                  value: parent.controllerName,
                },
                {
                  name: t('translation|Conditions'),
                  value: <ConditionList conditions={parent.conditions} />,
                  valueFullRow: true,
                },
              ]}
            />
          );
        })
      )}
    </SectionBox>
  );
}
