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
import ClusterRoleBinding from '../../lib/k8s/clusterRoleBinding';
import RoleBinding from '../../lib/k8s/roleBinding';
import { useNamespaces } from '../../redux/filterSlice';
import { Link } from '../common';
import LabelListItem from '../common/LabelListItem';
import ResourceListView from '../common/Resource/ResourceListView';

function RoleLink(props: { role: string; namespace?: string; cluster: string }) {
  const { role, namespace, cluster } = props;

  if (namespace) {
    return (
      <Link routeName="role" params={{ name: role, namespace }} activeCluster={cluster} tooltip>
        {role}
      </Link>
    );
  }

  return (
    <Link routeName="clusterrole" params={{ name: role }} activeCluster={cluster} tooltip>
      {role}
    </Link>
  );
}

export default function RoleBindingList() {
  const { t } = useTranslation(['glossary', 'translation']);
  const { items: roles, errors: roleErrors } = RoleBinding.useList({
    namespace: useNamespaces(),
  });
  const { items: clusterRoles, errors: clusterRoleErrors } = ClusterRoleBinding.useList();

  const allRoles = React.useMemo(() => {
    if (roles === null && clusterRoles === null) {
      return null;
    }

    return roles ? roles.concat(clusterRoles || []) : clusterRoles;
  }, [roles, clusterRoles]);

  const allErrors = React.useMemo(() => {
    if (roleErrors === null && clusterRoleErrors === null) {
      return null;
    }

    return [...(roleErrors ?? []), ...(clusterRoleErrors ?? [])];
  }, [roleErrors, clusterRoleErrors]);

  function sortBindings(kind: string) {
    return function (r1: RoleBinding, r2: RoleBinding) {
      const groups1 = r1?.subjects
        ?.filter(subject => subject.kind === kind)
        .map(subject => subject.name);
      const groups2 = r2?.subjects
        ?.filter(subject => subject.kind === kind)
        .map(subject => subject.name);
      if (groups1 && groups2) {
        return groups1.join('').localeCompare(groups2.join(''));
      } else if (groups1) {
        return 1;
      } else if (groups2) {
        return -1;
      } else {
        return 0;
      }
    };
  }

  return (
    <ResourceListView
      title={t('glossary|Role Bindings')}
      errors={allErrors}
      columns={[
        'type',
        'name',
        {
          id: 'namespace',
          label: t('glossary|Namespace'),
          getValue: item => item.getNamespace() ?? t('translation|All namespaces'),
          render: item =>
            item.getNamespace() ? (
              <Link
                routeName="namespace"
                params={{ name: item.getNamespace() }}
                activeCluster={item.cluster}
              >
                {item.getNamespace()}
              </Link>
            ) : (
              t('translation|All namespaces')
            ),
        },
        'cluster',
        {
          id: 'role',
          label: t('glossary|Role'),
          getValue: item => item.roleRef.name,
          render: item => (
            <RoleLink
              role={item.roleRef.name}
              namespace={item.getNamespace()}
              cluster={item.cluster}
            />
          ),
        },
        {
          id: 'users',
          label: t('translation|Users'),
          getValue: item =>
            item?.subjects
              ?.filter(s => s.kind === 'User')
              ?.map(s => s.name)
              ?.join(' '),
          render: item => (
            <LabelListItem
              labels={
                item?.subjects
                  ?.filter(subject => subject.kind === 'User')
                  .map(subject => subject.name) || []
              }
            />
          ),
          sort: sortBindings('User'),
        },
        {
          id: 'groups',
          label: t('glossary|Groups'),
          getValue: item =>
            item?.subjects
              ?.filter(subject => subject.kind === 'Group')
              ?.map(subject => subject.name)
              ?.join(' '),
          render: item => (
            <LabelListItem
              labels={
                item?.subjects
                  ?.filter(subject => subject.kind === 'Group')
                  .map(subject => subject.name) || []
              }
            />
          ),
          sort: sortBindings('Group'),
        },
        {
          id: 'serviceaccounts',
          label: t('glossary|Service Accounts'),
          getValue: item =>
            item?.subjects
              ?.filter(subject => subject.kind === 'ServiceAccount')
              ?.map(subject => subject.name)
              ?.join(' '),
          render: item => (
            <LabelListItem
              labels={
                item?.subjects
                  ?.filter(subject => subject.kind === 'ServiceAccount')
                  .map(subject => subject.name) || []
              }
            />
          ),
          sort: sortBindings('Service Accounts'),
        },
        'age',
      ]}
      data={allRoles}
      id="headlamp-rolebindings"
    />
  );
}
