import { Icon } from '@iconify/react';
import { Button, useTheme } from '@mui/material';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { isEqual } from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { generatePath, useHistory } from 'react-router-dom';
import helpers from '../../../helpers';
import { useClustersConf, useClustersVersion } from '../../../lib/k8s';
import { ApiError, deleteCluster } from '../../../lib/k8s/apiProxy';
import { Cluster } from '../../../lib/k8s/cluster';
import Event from '../../../lib/k8s/event';
import { createRouteURL } from '../../../lib/router';
import { getClusterPrefixedPath, useId } from '../../../lib/util';
import { setConfig } from '../../../redux/configSlice';
import { useTypedSelector } from '../../../redux/reducers/reducers';
import { Link, PageGrid, SectionBox, SectionFilterHeader, Table } from '../../common';
import { ConfirmDialog } from '../../common';
import ErrorBoundary from '../../common/ErrorBoundary/ErrorBoundary';
import RecentClusters from './RecentClusters';

interface ContextMenuProps {
  /** The cluster for the context menu to act on. */
  cluster: Cluster;
}

function ContextMenu({ cluster }: ContextMenuProps) {
  const { t } = useTranslation(['translation']);
  const history = useHistory();
  const dispatch = useDispatch();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const menuId = useId('context-menu');
  const [openConfirmDialog, setOpenConfirmDialog] = React.useState<string | null>(null);
  const dialogs = useTypedSelector(state => state.clusterProvider.dialogs);
  const menuItems = useTypedSelector(state => state.clusterProvider.menuItems);

  function removeCluster(cluster: Cluster) {
    deleteCluster(cluster.name || '')
      .then(config => {
        dispatch(setConfig(config));
      })
      .catch((err: Error) => {
        if (err.message === 'Not Found') {
          // TODO: create notification with error message
        }
      })
      .finally(() => {
        history.push('/');
      });
  }

  function handleMenuClose() {
    setAnchorEl(null);
  }

  return (
    <>
      <Tooltip title={t('Actions')}>
        <IconButton
          size="small"
          onClick={event => {
            setAnchorEl(event.currentTarget);
          }}
          aria-haspopup="menu"
          aria-controls={menuId}
          aria-label={t('Actions')}
        >
          <Icon icon="mdi:more-vert" />
        </IconButton>
      </Tooltip>
      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => {
          handleMenuClose();
        }}
      >
        <MenuItem
          onClick={() => {
            history.push(createRouteURL('cluster', { cluster: cluster.name }));
            handleMenuClose();
          }}
        >
          <ListItemText>{t('translation|View')}</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            history.push(createRouteURL('settingsCluster', { cluster: cluster.name }));
            handleMenuClose();
          }}
        >
          <ListItemText>{t('translation|Settings')}</ListItemText>
        </MenuItem>
        {helpers.isElectron() && cluster.meta_data?.source === 'dynamic_cluster' && (
          <MenuItem
            onClick={() => {
              setOpenConfirmDialog('deleteDynamic');
              handleMenuClose();
            }}
          >
            <ListItemText>{t('translation|Delete')}</ListItemText>
          </MenuItem>
        )}

        {menuItems.map((Item, index) => {
          return (
            <Item
              cluster={cluster}
              setOpenConfirmDialog={setOpenConfirmDialog}
              handleMenuClose={handleMenuClose}
              key={index}
            />
          );
        })}
      </Menu>
      <ConfirmDialog
        open={openConfirmDialog === 'deleteDynamic'}
        handleClose={() => setOpenConfirmDialog('')}
        onConfirm={() => {
          setOpenConfirmDialog('');
          removeCluster(cluster);
        }}
        title={t('translation|Delete Cluster')}
        description={t(
          'translation|Are you sure you want to remove the cluster "{{ clusterName }}"?',
          {
            clusterName: cluster.name,
          }
        )}
      />
      {openConfirmDialog !== null &&
        dialogs.map((Dialog, index) => {
          return (
            <ErrorBoundary>
              <Dialog
                cluster={cluster}
                openConfirmDialog={openConfirmDialog}
                setOpenConfirmDialog={setOpenConfirmDialog}
                key={index}
              />
            </ErrorBoundary>
          );
        })}
    </>
  );
}

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

  if (!helpers.isElectron() && Object.keys(clusters).length === 1) {
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
  const history = useHistory();
  const { clusters } = props;
  const [customNameClusters, setCustomNameClusters] = React.useState(getClusterNames());
  const { t } = useTranslation(['translation', 'glossary']);
  const [versions, errors] = useClustersVersion(Object.values(clusters));
  const warningLabels = useWarningSettingsPerCluster(
    Object.values(customNameClusters).map(c => c.name)
  );

  React.useEffect(() => {
    setCustomNameClusters(currentNames => {
      if (isEqual(currentNames, getClusterNames())) {
        return currentNames;
      }
      return getClusterNames();
    });
  }, [customNameClusters]);

  function getClusterNames() {
    return Object.values(clusters)
      .map(c => ({
        ...c,
        name: c.meta_data?.extensions?.headlamp_info?.customName || c.name,
      }))
      .sort();
  }

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
          <Table
            data={Object.values(customNameClusters)}
            enableRowSelection
            initialState={{
              sorting: [{ id: 'name', desc: false }],
            }}
            muiToolbarAlertBannerProps={{
              sx: theme => ({
                background: theme.palette.background.muted,
              }),
            }}
            renderToolbarAlertBannerContent={({ table }) => (
              <Button
                variant="contained"
                sx={{
                  marginLeft: 1,
                }}
                onClick={() => {
                  const selectedClusters = table.getSelectedRowModel().rows.map(it => it.original);

                  history.push({
                    pathname: generatePath(getClusterPrefixedPath(), {
                      cluster: selectedClusters.map(cluster => cluster.name).join('+'),
                    }),
                  });
                }}
              >
                {t('View {{count}} clusters', { count: table.getSelectedRowModel().rows.length })}
              </Button>
            )}
            columns={[
              {
                id: 'name',
                header: t('Name'),
                accessorKey: 'name',
                Cell: ({ row: { original } }) => (
                  <Link routeName="cluster" params={{ cluster: original.name }}>
                    {original.name}
                  </Link>
                ),
              },
              {
                header: t('Origin'),
                accessorFn: cluster => getOrigin(cluster),
                Cell: ({ row: { original } }) => (
                  <Typography variant="body2">{getOrigin(clusters[original.name])}</Typography>
                ),
              },
              {
                header: t('Status'),
                accessorFn: cluster =>
                  errors[cluster.name] === null ? 'Active' : errors[cluster.name]?.message,
                Cell: ({ row: { original } }) => <ClusterStatus error={errors[original.name]} />,
              },
              { header: t('Warnings'), accessorFn: cluster => warningLabels[cluster.name] },
              {
                header: t('Kubernetes Version'),
                accessorFn: ({ name }) => versions[name]?.gitVersion || '⋯',
              },
              {
                header: '',
                muiTableBodyCellProps: {
                  align: 'right',
                },
                accessorFn: cluster =>
                  errors[cluster.name] === null ? 'Active' : errors[cluster.name]?.message,
                Cell: ({ row: { original: cluster } }) => {
                  return <ContextMenu cluster={cluster} />;
                },
              },
            ]}
          />
        </SectionBox>
      </PageGrid>
    ),
    [customNameClusters, errors, versions, warningLabels]
  );

  return memoizedComponent;
}
