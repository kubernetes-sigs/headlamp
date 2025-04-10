import { Icon } from '@iconify/react';
import { useTheme } from '@mui/material';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useClustersConf, useClustersVersion } from '../../../lib/k8s';
import { ApiError } from '../../../lib/k8s/apiProxy';
import { Cluster } from '../../../lib/k8s/cluster';
import { Link } from '../../common';
import ResourceTable from '../../common/Resource/ResourceTable';
import ClusterContextMenu from './ClusterContextMenu';
import { getCustomClusterNames } from './customClusterNames';

/**
 * ClusterStatus component displays the status of a cluster.
 * It shows an icon and a message indicating whether the cluster is active, unknown, or has an error.
 *
 * @param {Object} props - The component props.
 * @param {ApiError|null} [props.error] - The error object if there is an error with the cluster.
 */
function ClusterStatus({ error }: { error?: ApiError | null }) {
  const { t } = useTranslation(['translation']);
  const theme = useTheme();

  const stateUnknown = error === undefined;
  const hasReachError = error && error.status !== 401 && error.status !== 403;

  return (
    <Box width="fit-content">
      <Box display="flex" alignItems="center" justifyContent="center">
        {hasReachError ? (
          <Icon icon="mdi:cloud-off" width={16} color={theme.palette.home.status.error} />
        ) : stateUnknown ? (
          <Icon icon="mdi:cloud-question" width={16} color={theme.palette.home.status.unknown} />
        ) : (
          <Icon
            icon="mdi:cloud-check-variant"
            width={16}
            color={theme.palette.home.status.success}
          />
        )}
        <Typography
          variant="body2"
          style={{
            marginLeft: theme.spacing(1),
            color: hasReachError
              ? theme.palette.home.status.error
              : !stateUnknown
              ? theme.palette.home.status.success
              : undefined,
          }}
        >
          {hasReachError ? error.message : stateUnknown ? '⋯' : t('translation|Active')}
        </Typography>
      </Box>
    </Box>
  );
}

export interface ClusterTableProps {
  /** Some clusters have custom names. */
  customNameClusters: ReturnType<typeof getCustomClusterNames>;
  /** Versions for each cluster. */
  versions: ReturnType<typeof useClustersVersion>[0];
  /** Errors for each cluster. */
  errors: ReturnType<typeof useClustersVersion>[1];
  /** Clusters configuration. */
  clusters: ReturnType<typeof useClustersConf>;
  /** Warnings for each cluster. */
  warningLabels: { [cluster: string]: string };
}

/**
 * ClusterTable component displays a table of clusters with their status, origin, and version.
 */
export default function ClusterTable({
  customNameClusters,
  versions,
  errors,
  clusters,
  warningLabels,
}: ClusterTableProps) {
  const { t } = useTranslation(['translation']);

  /**
   * Gets the origin of a cluster.
   *
   * @param cluster
   * @returns A description of where the cluster is picked up from: dynamic, in-cluster, or from a kubeconfig file.
   */
  function getOrigin(cluster: Cluster): string {
    if (cluster.meta_data?.source === 'kubeconfig') {
      const kubeconfigPath = process.env.KUBECONFIG ?? '~/.kube/config';
      return `Kubeconfig: ${kubeconfigPath}`;
    } else if (cluster.meta_data?.source === 'dynamic_cluster') {
      return t('translation|Plugin');
    } else if (cluster.meta_data?.source === 'in_cluster') {
      return t('translation|In-cluster');
    }
    return 'Unknown';
  }

  return (
    <ResourceTable<any>
      defaultSortingColumn={{ id: 'name', desc: false }}
      columns={[
        {
          id: 'name',
          label: t('Name'),
          getValue: cluster => cluster.name,
          render: ({ name }) => (
            <Link routeName="cluster" params={{ cluster: name }}>
              {name}
            </Link>
          ),
        },
        {
          label: t('Origin'),
          getValue: cluster => getOrigin(cluster),
          render: ({ name }) => (
            <Typography variant="body2">{getOrigin((clusters || {})[name])}</Typography>
          ),
        },
        {
          label: t('Status'),
          getValue: cluster =>
            errors[cluster.name] === null ? 'Active' : errors[cluster.name]?.message,
          render: ({ name }) => <ClusterStatus error={errors[name]} />,
        },
        {
          label: t('Warnings'),
          getValue: ({ name }) => warningLabels[name],
        },
        {
          label: t('glossary|Kubernetes Version'),
          getValue: ({ name }) => versions[name]?.gitVersion || '⋯',
        },
        {
          label: '',
          getValue: cluster =>
            errors[cluster.name] === null ? 'Active' : errors[cluster.name]?.message,
          cellProps: {
            align: 'right',
          },
          render: cluster => {
            return <ClusterContextMenu cluster={cluster} />;
          },
        },
      ]}
      data={Object.values(customNameClusters)}
      id="headlamp-home-clusters"
    />
  );
}
