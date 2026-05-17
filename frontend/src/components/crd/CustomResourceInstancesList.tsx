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

interface ClassifiedCrd {
  crd: CRD;
  crdClass: NonNullable<ReturnType<CRD['makeCRClassOrNull']>>;
}

// Cluster-qualified identity so cross-cluster CRDs with the same name don't
// collide; name fallback covers in-flight objects that lack a uid.
function sortKey(crd: CRD): string {
  return `${crd.cluster}/${crd.metadata.uid || crd.metadata.name}`;
}

// Compact, content-stable fingerprint for use as a React `key`. Avoids passing
// a multi-kilobyte joined string into the reconciler when the CRD set is large.
// Combines two 32-bit hashes with different seeds for added collision
// resistance (not a uniform cryptographic 64-bit hash, but more robust than
// either single 32-bit hash alone) without BigInt literals, which not every
// bundler target parses. The prefixed length is a separate discriminator so
// any membership-size change forces a remount even if the hashes collide.
function fingerprint(keys: string[]): string {
  let hashA = 0x811c9dc5 | 0; // FNV-1a 32-bit offset basis
  let hashB = 0xdeadbeef | 0; // arbitrary independent seed
  for (const k of keys) {
    for (let i = 0; i < k.length; i++) {
      const c = k.charCodeAt(i);
      hashA = Math.imul(hashA ^ c, 0x01000193) | 0;
      hashB = Math.imul(hashB ^ c, 0x5bd1e995) | 0;
    }
    // Entry separator so `['ab','c']` and `['a','bc']` produce distinct hashes.
    hashA = Math.imul(hashA ^ 0x1f, 0x01000193) | 0;
    hashB = Math.imul(hashB ^ 0x1f, 0x5bd1e995) | 0;
  }
  const a = (hashA >>> 0).toString(36);
  const b = (hashB >>> 0).toString(36);
  return `${keys.length}:${a}.${b}`;
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
        title="Custom Resource Instances"
        headerProps={{
          noNamespaceFilter: false,
        }}
        errorMessage={
          allFailed ? t('translation|Failed to load custom resource instances') : undefined
        }
        data={crInstancesList}
        columns={[
          {
            label: 'Instance name',
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
            label: 'CRD',
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
            label: 'Categories',
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
  // across fetches — otherwise hook state shuffles. Sort by cluster-qualified
  // id and derive `remountKey` from the same sorted list so a reorder doesn't
  // remount and a real membership change does (#4824).
  const classified = useMemo<ClassifiedCrd[]>(() => {
    if (!crds) return [];
    const result: ClassifiedCrd[] = [];
    for (const crd of crds) {
      const crdClass = crd.makeCRClassOrNull();
      if (crdClass) result.push({ crd, crdClass });
    }
    result.sort((a, b) => {
      const ak = sortKey(a.crd);
      const bk = sortKey(b.crd);
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });
    return result;
  }, [crds]);

  const remountKey = useMemo(
    () => fingerprint(classified.map(it => sortKey(it.crd))),
    [classified]
  );

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
