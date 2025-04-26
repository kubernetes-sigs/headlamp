import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSelectedClusters } from '../../lib/k8s';
import ClusterRole from '../../lib/k8s/clusterRole';
import Role from '../../lib/k8s/role';
import { useNamespaces } from '../../redux/filterSlice';
import Link from '../common/Link';
import ResourceListView from '../common/Resource/ResourceListView';
import { ColumnType } from '../common/Resource/ResourceTable';

export default function RoleList() {
  const { t } = useTranslation('glossary');
  const { items: roles, errors: rolesErrors } = Role.useList({ namespace: useNamespaces() });
  const { items: clusterRoles, errors: clusterRolesErrors } = ClusterRole.useList();

  const clusters = useSelectedClusters();
  const isMultiCluster = clusters.length > 1;

  const allRoles = React.useMemo(() => {
    if (roles === null && clusterRoles === null) {
      return null;
    }

    return roles ? roles.concat(clusterRoles || []) : clusterRoles;
  }, [roles, clusterRoles]);

  const allErrors = React.useMemo(() => {
    if (rolesErrors === null && clusterRolesErrors === null) {
      return null;
    }

    return [...(rolesErrors ?? []), ...(clusterRolesErrors ?? [])];
  }, [rolesErrors, clusterRolesErrors]);

  return (
    <ResourceListView
      title={t('Roles')}
      errors={allErrors}
      columns={[
        'type',
        {
          label: t('translation|Name'),
          getValue: item => item.metadata.name,
          gridTemplate: 'auto',
          render: item => (
            <Link
              routeName={item.metadata.namespace ? 'role' : 'clusterrole'}
              params={{
                namespace: item.metadata.namespace || '',
                name: item.metadata.name,
                cluster: item.cluster,
              }}
            >
              {item.metadata.name}
            </Link>
          ),
        },
        'namespace',
        ...(isMultiCluster ? (['cluster'] as ColumnType[]) : ([] as ColumnType[])),
        'age',
      ]}
      data={allRoles}
      id="headlamp-roles"
    />
  );
}
