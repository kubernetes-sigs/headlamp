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
import { ResourceClasses } from '../../lib/k8s';
import ClusterRoleBinding from '../../lib/k8s/clusterRoleBinding';
import RoleBinding from '../../lib/k8s/roleBinding';
import ServiceAccount from '../../lib/k8s/serviceAccount';
import Link from '../common/Link';
import { DetailsGrid } from '../common/Resource';
import { SectionBox } from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

function SecretLinks(props: { items?: { name: string }[]; namespace: string }) {
  const { items, namespace } = props;
  if (!items?.length) return null;
  return (
    <React.Fragment>
      {items.map(({ name }, index) => (
        <React.Fragment key={`${name}__${index}`}>
          <Link routeName="secret" params={{ namespace, name }}>
            {name}
          </Link>
          {index !== items.length - 1 && ', '}
        </React.Fragment>
      ))}
    </React.Fragment>
  );
}

/**
 * Renders the role referenced by a (Cluster)RoleBinding as a link to the Role/ClusterRole
 * detail page, falling back to plain text when the resource class is not available.
 */
function RoleRefLink(props: { binding: RoleBinding | ClusterRoleBinding }) {
  const { binding } = props;
  const roleRef = binding.roleRef;
  if (!roleRef) {
    return null;
  }

  const label = `${roleRef.kind}: ${roleRef.name}`;
  const roleClass = ResourceClasses[roleRef.kind as keyof typeof ResourceClasses];
  if (!roleClass) {
    return <>{label}</>;
  }

  // A RoleBinding may reference either a Role or a ClusterRole. Only pass a namespace
  // when the referenced role is itself namespaced — a RoleBinding's own namespace must
  // not be attached to a ClusterRole link, or it resolves as a namespaced Role instead.
  const params = roleClass.isNamespaced
    ? { name: roleRef.name, namespace: binding.metadata.namespace }
    : { name: roleRef.name };

  return (
    <Link routeName={roleClass.detailsRoute} activeCluster={binding.cluster} params={params}>
      {label}
    </Link>
  );
}

/**
 * Lists the RoleBindings and ClusterRoleBindings whose subjects reference this
 * ServiceAccount, so the permissions granted to the account are discoverable from
 * its detail page. Each row links to the binding and to its Role/ClusterRole.
 */
function ServiceAccountBindings(props: { serviceAccount: ServiceAccount }) {
  const { serviceAccount } = props;
  const { t } = useTranslation('glossary');
  const name = serviceAccount.metadata.name;
  const namespace = serviceAccount.metadata.namespace ?? '';

  // Fetched cluster-wide (no namespace scope): a RoleBinding can live in any namespace while
  // still referencing a ServiceAccount from another namespace via its subject, so scoping the
  // list to the ServiceAccount's own namespace would miss cross-namespace RoleBindings.
  const {
    items: roleBindings,
    isLoading: roleBindingsLoading,
    isError: roleBindingsError,
  } = RoleBinding.useList({
    cluster: serviceAccount.cluster,
  });
  const {
    items: clusterRoleBindings,
    isLoading: clusterRoleBindingsLoading,
    isError: clusterRoleBindingsError,
  } = ClusterRoleBinding.useList({ cluster: serviceAccount.cluster });

  const bindings = React.useMemo(() => {
    const all = [...(roleBindings ?? []), ...(clusterRoleBindings ?? [])];
    return all.filter(binding =>
      binding.subjects?.some(
        subject =>
          subject.kind === 'ServiceAccount' &&
          subject.name === name &&
          // A subject that omits namespace implicitly refers to the binding's own namespace
          // (Kubernetes semantics for RoleBindings). For ClusterRoleBindings,
          // binding.metadata.namespace is undefined, so omitting namespace produces no match.
          (subject.namespace ?? binding.metadata.namespace) === namespace
      )
    );
  }, [roleBindings, clusterRoleBindings, name, namespace]);

  const isLoading = roleBindingsLoading || clusterRoleBindingsLoading;
  // Surface an error when we have no results to show and at least one of the list calls failed —
  // useKubeObjectList returns items: [] on error, so an empty result after a failure could
  // otherwise be misreported as "no bindings" when the listing was really just incomplete. If we
  // do have any results (even partial/stale), prefer showing them rather than an error.
  const hasError = (roleBindingsError || clusterRoleBindingsError) && bindings.length === 0;

  // Show the loading state until both lists have finished their initial fetch, then render the
  // (possibly empty) results. When a list errors with no results, pass null data alongside an
  // errorMessage so the table surfaces an explicit "cannot list" state instead of a misleading
  // empty message; partial results from a succeeding list stay visible.
  const data = isLoading || hasError ? null : bindings;

  return (
    <SectionBox title={t('Role Bindings')}>
      <SimpleTable
        data={data}
        emptyMessage={t('No role bindings reference this service account.')}
        errorMessage={
          hasError ? t('Unable to list the role bindings for this service account.') : undefined
        }
        columns={[
          {
            label: t('translation|Name'),
            getter: (binding: RoleBinding | ClusterRoleBinding) => (
              <Link kubeObject={binding}>{binding.metadata.name}</Link>
            ),
          },
          {
            label: t('Kind'),
            getter: (binding: RoleBinding | ClusterRoleBinding) => binding.kind,
          },
          {
            label: t('Role'),
            getter: (binding: RoleBinding | ClusterRoleBinding) => (
              <RoleRefLink binding={binding} />
            ),
          },
          {
            label: t('Namespace'),
            getter: (binding: RoleBinding | ClusterRoleBinding) =>
              binding.metadata.namespace || '-',
          },
        ]}
        reflectInURL="roleBindings"
      />
    </SectionBox>
  );
}

export default function ServiceAccountDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation('glossary');

  return (
    <DetailsGrid
      resourceType={ServiceAccount}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('Secrets'),
            value: <SecretLinks items={item.secrets} namespace={namespace} />,
            hide: !item.secrets?.length,
          },
          {
            name: t('Image Pull Secrets'),
            value: <SecretLinks items={item.imagePullSecrets} namespace={namespace} />,
            hide: !item.imagePullSecrets?.length,
          },
          {
            name: t('Automount Service Account Token'),
            value:
              item.automountServiceAccountToken === undefined
                ? ''
                : item.automountServiceAccountToken
                ? t('translation|Yes')
                : t('translation|No'),
            hide: item.automountServiceAccountToken === undefined,
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.serviceaccount-role-bindings',
            section: <ServiceAccountBindings serviceAccount={item} />,
          },
        ]
      }
    />
  );
}
