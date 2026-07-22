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

import { JSONPath } from 'jsonpath-plus';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useSelectedClusters } from '../../lib/k8s';
import CRD, { KubeCRD } from '../../lib/k8s/crd';
import { KubeObject } from '../../lib/k8s/KubeObject';
import { localeDate } from '../../lib/util';
import { EmptyContent as Empty, Link, Loader, ResourceListView } from '../common';
import {
  ColumnType,
  ResourceTableColumn,
  ResourceTableProps,
} from '../common/Resource/ResourceTable';

export default function CustomResourceList() {
  const { t } = useTranslation(['glossary', 'translation']);
  const { crd: crdName } = useParams<{ crd: string }>();
  const [crd, error] = CRD.useGet(crdName);

  if (!crd && !error) {
    return <Loader title={t('translation|Loading custom resource definition')} />;
  }

  if (!!error) {
    return (
      <Empty color="error">
        {t(
          'translation|Error getting custom resource definition {{ crdName }}: {{ errorMessage }}',
          {
            crdName,
            errorMessage: error,
          }
        )}
      </Empty>
    );
  }

  return <CustomResourceListTable crd={crd!} />;
}

function CustomResourceLink(props: {
  resource: KubeObject<KubeCRD>;
  crd: CRD;
  [otherProps: string]: any;
}) {
  const { resource, crd, ...otherProps } = props;

  return (
    <Link
      sx={{ cursor: 'pointer' }}
      routeName="customresource"
      params={{
        crName: resource.metadata.name,
        crd: crd.metadata.name,
        namespace: resource.metadata.namespace || '-',
      }}
      activeCluster={resource.cluster}
      {...otherProps}
    >
      {resource.metadata.name}
    </Link>
  );
}

function getValueWithJSONPath(item: { jsonData: object }, jsonPath: string): string {
  let value: string | undefined;
  try {
    // Extract the value from the json item
    value = JSONPath({ path: '$' + jsonPath, json: item.jsonData });
  } catch (err) {
    console.error(`Failed to get value from JSONPath ${jsonPath} on CR item ${item}`);
  }

  // Make sure the value will be represented in string form (to account for
  // e.g. cases where we may get an array).
  return value?.toString() || '';
}

export interface CustomResourceTableProps {
  crd: CRD;
  title?: string;
  includeCRDLink?: boolean;
}

export function CustomResourceListTable(props: CustomResourceTableProps) {
  // Outer table only emits the incomplete-spec message from the
  // `translation` namespace; the inner `CustomResourceTableInner` loads
  // both namespaces because it also reads `glossary|CRD: …`.
  const { t } = useTranslation('translation');
  const { crd } = props;

  // Memoized on the CRD instance: the list/get hooks return a fresh CRD object
  // on every update, so a spec that arrives later comes in as a new `crd`
  // reference and the memo recomputes rather than going stale. Memoizing also
  // keeps the constructed class identity stable across renders.
  const CRClass = React.useMemo(() => crd.makeCRClassOrNull(), [crd]);
  const apiGroup = React.useMemo(() => crd.getMainAPIGroupOrNull(), [crd]);

  if (!CRClass || !apiGroup) {
    // The outer `CustomResourceList` has already resolved `crd` from the API,
    // so reaching here means the CRD object is loaded but its spec is missing
    // required fields. The state may be transient (e.g. an in-flight watch
    // update) or persistent (a malformed CRD); rather than guess and risk an
    // indefinite spinner, show an explicit empty message and let the next
    // refetch swap us back into the data path when the spec becomes complete.
    return <Empty>{t('translation|This CustomResourceDefinition has an incomplete spec.')}</Empty>;
  }

  return <CustomResourceTableInner {...props} CRClass={CRClass} apiGroup={apiGroup} />;
}

function CustomResourceTableInner(
  props: CustomResourceTableProps & {
    CRClass: NonNullable<ReturnType<CRD['makeCRClassOrNull']>>;
    apiGroup: NonNullable<ReturnType<CRD['getMainAPIGroupOrNull']>>;
  }
) {
  const { t } = useTranslation(['glossary', 'translation']);
  const {
    crd,
    // `spec.names.kind` is guaranteed non-empty here because the outer
    // `CustomResourceListTable` short-circuits to an "incomplete spec"
    // message via `validateCRDSpec` before rendering this inner component.
    title = crd.spec.names.kind,
    includeCRDLink,
    CRClass,
    apiGroup,
  } = props;

  const clusters = useSelectedClusters();
  const isMultiCluster = clusters.length > 1;

  // Memoized on [crd, apiGroup] so the memo is correct by construction:
  // even though `apiGroup` is currently derived from `crd` upstream, listing
  // it keeps this hook's dependency graph honest if the upstream memoization
  // ever loosens. The trailing `cols` memo lists `additionalPrinterCols`,
  // so a stable reference here cascades down.
  const additionalPrinterCols = React.useMemo(() => {
    const currentVersion = apiGroup[1];
    const colsFromSpec =
      crd.jsonData.spec?.versions?.find(
        (version: KubeCRD['spec']['versions'][number]) => version.name === currentVersion
      )?.additionalPrinterColumns || [];
    const cols: ResourceTableColumn<KubeObject<KubeCRD>>[] = [];
    for (let i = 0; i < colsFromSpec.length; i++) {
      const idx = i;
      const colSpec = colsFromSpec[idx];
      // Skip creation date because we already show it by default.
      if (colSpec.jsonPath === '.metadata.creationTimestamp') {
        continue;
      }
      cols.push({
        label: colSpec.name,
        getValue: resource => {
          let value = getValueWithJSONPath(resource, colSpec.jsonPath);
          if (colSpec.type === 'date') {
            value = localeDate(new Date(value));
          }
          return value;
        },
      });
    }
    return cols;
  }, [crd, apiGroup]);

  const cols = React.useMemo(
    () => {
      const colsToDisplay: ResourceTableProps<KubeObject<KubeCRD>>['columns'] = [
        {
          label: t('translation|Name'),
          getValue: resource => resource.metadata.name,
          render: resource => <CustomResourceLink resource={resource} crd={crd} />,
        },
        ...(isMultiCluster ? (['cluster'] as ColumnType[]) : ([] as ColumnType[])),
        ...additionalPrinterCols,
        'labels',
        'age',
      ];

      if (crd.isNamespacedScope) {
        colsToDisplay.splice(1, 0, 'namespace');
      }

      return colsToDisplay;
    },
    // `t` is intentionally omitted from the deps array; including it has been
    // observed to break this hook in practice (see #5183).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [crd, additionalPrinterCols, isMultiCluster]
  );

  return (
    <ResourceListView
      title={title}
      headerProps={{
        noNamespaceFilter: !crd.isNamespacedScope,
        subtitle: (includeCRDLink ?? true) && (
          <Link routeName="crd" params={{ name: crd.metadata.name }} activeCluster={crd.cluster}>
            {t('glossary|CRD: {{ crdName }}', { crdName: crd.metadata.name })}
          </Link>
        ),
      }}
      resourceClass={CRClass}
      columns={cols}
    />
  );
}
