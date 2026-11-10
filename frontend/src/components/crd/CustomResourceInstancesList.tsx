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

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CRD from '../../lib/k8s/crd';
import { KubeObject } from '../../lib/k8s/KubeObject';
import { useNamespaces } from '../../redux/filterSlice';
import { EmptyContent as Empty, Link, Loader, ResourceListView, ShowHideLabel } from '../common/';
import { fingerprint, sortKey } from './crInstancesKey';

interface ClassifiedCrd {
  crd: CRD;
  crdClass: NonNullable<ReturnType<CRD['makeCRClassOrNull']>>;
  // Computed once per CRD during classification so the O(n log n) sort
  // comparisons and the remount-key fingerprint share the same cached key
  // instead of recomputing `sortKey(crd)` over and over. Named distinctly
  // from the imported helper so reading the field can't be confused with
  // a function call.
  crdSortKey: string;
}

function CrInstancesView({ classified }: { classified: ClassifiedCrd[] }) {
  const { t } = useTranslation(['glossary', 'translation']);

  const namespaces = useNamespaces();
  const dataClassCrds = classified.map(({ crd, crdClass }) => {
    const data = crdClass.useList({ cluster: crd.cluster, namespace: namespaces });
    return { data, crdClass, crd };
  });

  const crds = classified.map(it => it.crd);
  const queries = dataClassCrds.map(it => it.data);

  const [isWarningClosed, setIsWarningClosed] = useState(false);

  const isLoading = queries.some(it => it.isLoading || it.isFetching);

  // Collect the names of CRDs that failed to load lists
  const crdsFailedToLoad: string[] = [];
  queries.forEach((it, i) => {
    if (it.isError) {
      crdsFailedToLoad.push(crds[i].metadata.name);
    }
  });
  const allFailed = crdsFailedToLoad.length === queries.length;

  // Create a map to be able to link to CRD by CR kind
  const crKindToCRDMap = queries.reduce((acc, { items }, index) => {
    if (items?.[0]) {
      acc[items[0].kind] = crds[index];
    }
    return acc;
  }, {} as Record<string, CRD>);
  const getCRDForCR = (cr: KubeObject) => crKindToCRDMap[cr.kind];

  const crInstancesList = queries.flatMap(it => it.items ?? []);

  if (isLoading) {
    return <Loader title={t('translation|Loading custom resource instances')} />;
  }

  if (crInstancesList.length === 0) {
    return <Empty>{t('translation|No custom resources instances found.')}</Empty>;
  }

  return (
    <>
      {crdsFailedToLoad.length > 0 && !allFailed && !isWarningClosed && (
        <Alert
          severity="warning"
          variant="outlined"
          onClose={() => setIsWarningClosed(true)}
          sx={theme => ({ margin: theme.spacing(2, 2, 0, 2) })}
        >
          <AlertTitle>{t('translation|Failed to load custom resource instances')}</AlertTitle>
          <ShowHideLabel>{crdsFailedToLoad.join(', ')}</ShowHideLabel>
        </Alert>
      )}
      <ResourceListView
        title={t('translation|Custom Resource Instances')}
        headerProps={{
          noNamespaceFilter: false,
        }}
        errorMessage={
          allFailed ? t('translation|Failed to load custom resource instances') : undefined
        }
        data={crInstancesList}
        columns={[
          {
            label: t('translation|Instance name'),
            getValue: cr => {
              return cr.metadata.name;
            },
            render: cr => {
              return (
                <Link
                  routeName="customresource"
                  params={{
                    crName: cr.metadata.name,
                    crd: getCRDForCR(cr).metadata.name,
                    namespace: cr.metadata.namespace ?? '-',
                  }}
                  activeCluster={cr.cluster}
                >
                  {cr.metadata.name}
                </Link>
              );
            },
          },
          {
            label: t('translation|CRD'),
            filterVariant: 'multi-select',
            getValue: cr => cr.kind,
            render: cr => {
              return (
                <Link
                  routeName="crd"
                  params={{
                    name: getCRDForCR(cr).metadata.name,
                  }}
                  activeCluster={cr.cluster}
                >
                  {cr.kind}
                </Link>
              );
            },
          },
          'cluster',
          {
            label: t('translation|Categories'),
            getValue: cr => {
              const categories = getCRDForCR(cr).jsonData.status?.acceptedNames?.categories;
              return categories !== undefined ? categories.toString().split(',').join(', ') : '';
            },
          },
          'namespace',
          'labels',
          'age',
        ]}
      />
    </>
  );
}

export function CrInstanceList() {
  const { t } = useTranslation(['glossary', 'translation']);
  const {
    items: crds,
    error: crdsError,
    isLoading: isLoadingCRDs,
  } = CRD.useList({ namespace: useNamespaces() });

  // The child calls `useList` per entry, so iteration order must be stable
  // across fetches, otherwise hook state shuffles. Sort by cluster-qualified
  // id and derive `remountKey` from the same sorted list so a reorder doesn't
  // remount and a real membership change does (#4824).
  const classified = useMemo<ClassifiedCrd[]>(() => {
    if (!crds) return [];
    const result: ClassifiedCrd[] = [];
    for (const crd of crds) {
      const crdClass = crd.makeCRClassOrNull();
      if (crdClass) result.push({ crd, crdClass, crdSortKey: sortKey(crd) });
    }
    result.sort((a, b) => (a.crdSortKey < b.crdSortKey ? -1 : a.crdSortKey > b.crdSortKey ? 1 : 0));
    return result;
  }, [crds]);

  const remountKey = useMemo(() => fingerprint(classified.map(it => it.crdSortKey)), [classified]);

  if (crdsError) {
    return (
      <Empty color="error">
        {t('translation|Error getting custom resource definitions: {{ errorMessage }}', {
          errorMessage: crdsError,
        })}
      </Empty>
    );
  }

  if (isLoadingCRDs || !crds) {
    return <Loader title={t('translation|Loading custom resource definitions')} />;
  }

  // The CRD list request finished (above branches handle the loading/error
  // cases). If every CRD is unusable, that's a persistent state, not an
  // in-flight one, so show a non-loading empty message instead of an
  // indefinite spinner.
  if (crds.length > 0 && classified.length === 0) {
    return (
      <Empty>{t('translation|No CustomResourceDefinitions with usable specs were found.')}</Empty>
    );
  }

  return <CrInstancesView key={remountKey} classified={classified} />;
}
