import { Icon } from '@iconify/react';
import { useTheme } from '@mui/material';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { isEqual } from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { isElectron } from '../../../helpers/isElectron';
import { useClustersConf, useClustersVersion } from '../../../lib/k8s';
import { ApiError } from '../../../lib/k8s/apiProxy';
import { Cluster } from '../../../lib/k8s/cluster';
import Event from '../../../lib/k8s/event';
import { createRouteURL } from '../../../lib/router';
import { Link, PageGrid, SectionBox, SectionFilterHeader } from '../../common';
import ResourceTable from '../../common/Resource/ResourceTable';
import ClusterContextMenu from './ClusterContextMenu';
import { getCustomClusterNames } from './customClusterNames';
import RecentClusters from './RecentClusters';

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

export default function Home() {
  const history = useHistory();
  const clusters = useClustersConf() || {};

  if (!isElectron() && Object.keys(clusters).length === 1) {
    history.push(createRouteURL('cluster', { cluster: Object.keys(clusters)[0] }));
    return null;
  }

  return <HomeComponent clusters={clusters} key={Object.keys(clusters).join('')} />;
}

interface HomeComponentProps {
  clusters: { [name: string]: Cluster };
}

function useWarningSettingsPerCluster(clusterNames: string[]) {
  const warningsMap = Event.useWarningList(clusterNames);
  const [warningLabels, setWarningLabels] = React.useState<{ [cluster: string]: string }>({});
  const maxWarnings = 50;

  function renderWarningsText(warnings: typeof warningsMap, clusterName: string) {
    const numWarnings =
      (!!warnings[clusterName]?.error && -1) || (warnings[clusterName]?.warnings?.length ?? -1);

    if (numWarnings === -1) {
      return '⋯';
    }
    if (numWarnings >= maxWarnings) {
      return `${maxWarnings}+`;
    }
    return numWarnings.toString();
  }

  React.useEffect(() => {
    setWarningLabels(currentWarningLabels => {
      const newWarningLabels: { [cluster: string]: string } = {};
      for (const cluster of clusterNames) {
        newWarningLabels[cluster] = renderWarningsText(warningsMap, cluster);
      }
      if (!isEqual(newWarningLabels, currentWarningLabels)) {
        return newWarningLabels;
      }
      return currentWarningLabels;
    });
  }, [warningsMap]);

  return warningLabels;
}

function HomeComponent(props: HomeComponentProps) {
  const { clusters } = props;
  const [customNameClusters, setCustomNameClusters] = React.useState(
    getCustomClusterNames(clusters)
  );
  const { t } = useTranslation(['translation', 'glossary']);
  const [versions, errors] = useClustersVersion(Object.values(clusters));
  const warningLabels = useWarningSettingsPerCluster(
    Object.values(customNameClusters).map(c => c.name)
  );

  React.useEffect(() => {
    setCustomNameClusters(currentNames => {
      if (isEqual(currentNames, getCustomClusterNames(clusters))) {
        return currentNames;
      }
      return getCustomClusterNames(clusters);
    });
  }, [customNameClusters]);

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

  const memoizedComponent = React.useMemo(
    () => (
      <PageGrid>
        <SectionBox headerProps={{ headerStyle: 'main' }} title={t('Home')}>
          <RecentClusters clusters={Object.values(customNameClusters)} onButtonClick={() => {}} />
        </SectionBox>
        <SectionBox
          title={
            <SectionFilterHeader
              title={t('All Clusters')}
              noNamespaceFilter
              headerStyle="subsection"
            />
          }
        >
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
                  <Typography variant="body2">{getOrigin(clusters[name])}</Typography>
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
        </SectionBox>
      </PageGrid>
    ),
    [customNameClusters, errors, versions, warningLabels]
  );

  return memoizedComponent;
}
