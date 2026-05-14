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

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useSelectedClusters } from '../../lib/k8s';
import { kubeClassFromGenericResourceRef } from '../../lib/k8s/apiResourceKubeClass';
import type { GenericResourceRef } from '../../lib/k8s/genericResourceRef';
import { parseGenericResourceRef, serializeGenericResourceRef } from '../../lib/k8s/genericResourceRef';
import type { KubeObject } from '../../lib/k8s/KubeObject';
import { createRouteURL } from '../../lib/router/createRouteURL';
import type { FilterState } from '../../redux/filterSlice';
import { filterResource } from '../../redux/filterSlice';
import Empty from '../common/EmptyContent';
import Link from '../common/Link';
import ResourceListView from '../common/Resource/ResourceListView';
import type { ColumnType, ResourceTableColumn } from '../common/Resource/ResourceTable';

/** Namespace-agnostic table filter so global Headlamp namespace selection does not hide rows. */
const GENERIC_LIST_FILTER: FilterState = { namespaces: new Set() };

function genericListRowFilter(item: KubeObject, search?: string) {
  return filterResource(item.jsonData, GENERIC_LIST_FILTER, search);
}

function GenericResourceNameLink(props: {
  resource: KubeObject;
  refSnapshot: GenericResourceRef;
}) {
  const { resource, refSnapshot } = props;
  const resourceId = serializeGenericResourceRef(refSnapshot);
  return (
    <Link
      routeName="genericResource"
      params={{
        resourceId,
        namespace: resource.metadata.namespace || '-',
        name: resource.metadata.name,
      }}
      activeCluster={resource.cluster}
    >
      {resource.metadata.name}
    </Link>
  );
}

export default function GenericResourceList() {
  const { t } = useTranslation(['translation', 'glossary']);
  const { resourceId = '' } = useParams<{ resourceId: string }>();
  const clusters = useSelectedClusters();
  const isMultiCluster = clusters.length > 1;

  const ref = React.useMemo(() => parseGenericResourceRef(resourceId), [resourceId]);

  const kubeClass = React.useMemo(
    () => (ref ? kubeClassFromGenericResourceRef(ref) : null),
    [ref]
  );

  const backTo = createRouteURL('genericResources');

  const columns: (ResourceTableColumn<KubeObject> | ColumnType)[] = React.useMemo(() => {
    if (!ref) return [];
    const nameCol: ResourceTableColumn<KubeObject> = {
      label: t('translation|Name'),
      getValue: resource => resource.metadata.name,
      render: resource => <GenericResourceNameLink resource={resource} refSnapshot={ref} />,
    };
    const tail: (ResourceTableColumn<KubeObject> | ColumnType)[] = [];
    if (ref.isNamespaced) {
      tail.push('namespace');
    }
    if (isMultiCluster) {
      tail.push('cluster');
    }
    tail.push('labels', 'age');
    return [nameCol, ...tail];
  }, [ref, isMultiCluster, t]);

  if (!ref || !kubeClass) {
    return (
      <Empty color="error">
        {t('translation|Invalid or unknown resource type. Use the generic resources browser.')}
      </Empty>
    );
  }

  const title = `${ref.kind} (${ref.apiVersion})`;

  return (
    <ResourceListView
      title={title}
      backLink={backTo}
      resourceClass={kubeClass}
      columns={columns}
      id={`headlamp-generic-${ref.pluralName}`}
      ignoreGlobalNamespaceFilter
      filterFunction={genericListRowFilter}
      headerProps={{
        noNamespaceFilter: true,
      }}
    />
  );
}
