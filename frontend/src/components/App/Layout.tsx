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

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import CssBaseline from '@mui/material/CssBaseline';
import Link from '@mui/material/Link';
import { styled } from '@mui/material/styles';
import { Dispatch, UnknownAction } from '@reduxjs/toolkit';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { getCluster } from '../../lib/cluster';
import { getSelectedClusters } from '../../lib/cluster';
import { useClustersConf } from '../../lib/k8s';
import { request } from '../../lib/k8s/apiProxy';
import { Cluster } from '../../lib/k8s/cluster';
import { setConfig } from '../../redux/configSlice';
import { ConfigState } from '../../redux/configSlice';
import { useTypedSelector } from '../../redux/hooks';
import store from '../../redux/stores/store';
import { useUIPanelsGroupedBySide } from '../../redux/uiSlice';
import { fetchStatelessClusterKubeConfigs, isEqualClusterConfigs } from '../../stateless/';
import { ActivitiesRenderer } from '../activity/Activity';
import ActionsNotifier from '../common/ActionsNotifier';
import AlertNotification from '../common/AlertNotification';
import DetailsDrawer from '../common/Resource/DetailsDrawer';
import Sidebar, { NavigationTabs } from '../Sidebar';
import RouteSwitcher from './RouteSwitcher';
import TopBar from './TopBar';
import VersionDialog from './VersionDialog';

export interface LayoutProps {}

const CLUSTER_FETCH_INTERVAL = 10 * 1000; // ms

function ClusterNotFoundPopup({ cluster }: { cluster?: string }) {
  const problemCluster = cluster || getCluster();
  const { t } = useTranslation();

  return (
    <Box
      display={'flex'}
      justifyContent="center"
      sx={{
        position: 'absolute',
        color: 'common.white',
        textAlign: 'center',
      }}
      bgcolor={'error.main'}
      zIndex={1400}
      width={'100%'}
      p={0.5}
      alignItems="center"
    >
      <Box p={0.5}>
        {t(`Something went wrong with cluster {{ cluster }}`, { cluster: problemCluster })}
      </Box>
      <Button variant="contained" size="small" href={window.desktopApi ? '#' : '/'}>
        {t('Choose another cluster')}
      </Button>
    </Box>
  );
}
const Div = styled('div')``;
const Main = styled('main')``;

/**
 * Merges the new cluster with the current cluster.
 * Stateless clusters are merged with the current cluster.
 * It also preserves the useToken property.
 * @param newConfig - The new cluster config.
 * @param currentClusters - The current cluster config.
 * @param statelessClusters - The stateless cluster config.
 * @returns The merged cluster config.
 */
function mergeClusterConfigs(
  newClusters: Record<string, any>,
  currentClusters: Record<string, any>,
  statelessClusters: Record<string, any> | null
): Record<string, any> {
  const mergedClusters = { ...newClusters };

  // Merge stateless clusters
  if (statelessClusters) {
    Object.entries(statelessClusters).forEach(([key, cluster]) => {
      if (!mergedClusters[key]) {
        mergedClusters[key] = cluster;
      }
    });
  }

  // Preserve useToken property
  Object.entries(mergedClusters).forEach(([key, cluster]) => {
    if (currentClusters[key]?.useToken !== undefined) {
      mergedClusters[key] = {
        ...cluster,
        useToken: currentClusters[key].useToken,
      };
    }
  });

  return mergedClusters;
}

declare global {
  interface Window {
    clusterConfigFetchHandler: number;
  }
}

/**
 * Fetches the cluster config from the backend and updates the redux store
 * if the present stored config is different from the fetched one.
 */
const fetchConfig = (dispatch: Dispatch<UnknownAction>) => {
  const clusters = store.getState().config.clusters;
  const statelessClusters = store.getState().config.statelessClusters;

  return request('/config', {}, false, false).then(config => {
    const clustersToConfig: ConfigState['clusters'] = {};
    config?.clusters.forEach((cluster: Cluster) => {
      if (cluster.meta_data?.extensions?.headlamp_info?.customName) {
        cluster.name = cluster.meta_data?.extensions?.headlamp_info?.customName;
      }
      clustersToConfig[cluster.name] = cluster;
    });

    const configToStore = { ...config, clusters: clustersToConfig };

    if (clusters === null) {
      dispatch(setConfig(configToStore));
    } else {
      // Check if the config is different
      const configDifferent = isEqualClusterConfigs(clusters, clustersToConfig);

      if (configDifferent) {
        // Merge the new config with the current config
        const mergedClusters = mergeClusterConfigs(
          configToStore.clusters,
          clusters,
          statelessClusters
        );
        dispatch(
          setConfig({
            ...configToStore,
            clusters: mergedClusters,
          })
        );
      }
    }

    /**
     * Fetches the stateless cluster config from the indexDB and then sends the backend to parse it
     * only if the stateless cluster config is enabled in the backend.
     */
    if (config?.isDynamicClusterEnabled) {
      fetchStatelessClusterKubeConfigs(dispatch);
    }
  });
};

export default function Layout({}: LayoutProps) {
  const arePluginsLoaded = useTypedSelector(state => state.plugins.loaded);
  const dispatch = useDispatch();
  const clusters = useTypedSelector(state => state.config.clusters);
  const isFullWidth = useTypedSelector(state => state.ui.isFullWidth);
  const { t } = useTranslation();
  const allClusters = useClustersConf();

  /** This fetches the cluster config from the backend and updates the redux store on an interval.
   * When stateless clusters are enabled, it also fetches the stateless cluster config from the
   * indexDB and then sends the backend to parse it and then updates the parsed value into redux
   * store on an interval.
   * */
  useQuery({
    queryKey: ['cluster-fetch'],
    queryFn: () => fetchConfig(dispatch),
    refetchInterval: CLUSTER_FETCH_INTERVAL,
  });

  // Remove splash screen styles from the body
  // that are added in frontend/index.html
  useEffect(() => {
    document.body.removeAttribute('style');
  }, []);

  const urlClusters = getSelectedClusters();
  const clustersNotInURL =
    allClusters && urlClusters.length !== 0
      ? urlClusters.filter(clusterName => !Object.keys(allClusters).includes(clusterName))
      : [];
  const containerProps = isFullWidth
    ? ({ maxWidth: false, disableGutters: true } as const)
    : ({ maxWidth: 'xl' } as const);
  const MAXIMUM_NUM_ALERTS = 2;

  const panels = useUIPanelsGroupedBySide();

  return (
    <>
      <Link
        href="#main"
        sx={{
          border: 0,
          clip: 'rect(0 0 0 0)',
          height: '1px',
          margin: -1,
          overflow: 'hidden',
          padding: 0,
          position: 'absolute',
          whiteSpace: 'nowrap',
          width: '1px',
        }}
      >
        {t('Skip to main content')}
      </Link>
      <VersionDialog />
      <CssBaseline enableColorScheme />
      <ActionsNotifier />
      <Box sx={{ display: 'flex', height: '100dvh' }}>
        {panels.left.map(it => (
          <it.component key={it.id} />
        ))}
        <Box
          sx={{
            display: 'flex',
            overflow: 'auto',
            flexDirection: 'column',
            flexGrow: 1,
          }}
        >
          {panels.top.map(it => (
            <it.component key={it.id} />
          ))}
          <TopBar />
          <Box
            sx={{
              display: 'grid',
              overflow: 'hidden',
              flexGrow: 1,
              position: 'relative',
              gridTemplateRows: '1fr min-content',
              gridTemplateColumns: 'min-content 1fr',
            }}
          >
            <Sidebar />
            <Main
              id="main"
              sx={{
                overflow: 'auto',
                position: 'relative',
                minHeight: 0,
                gridColumn: '2 / 3',
                gridRow: '1 / 2',
              }}
            >
              {clustersNotInURL.slice(0, MAXIMUM_NUM_ALERTS).map(clusterName => (
                <ClusterNotFoundPopup key={clusterName} cluster={clusterName} />
              ))}
              <AlertNotification />
              <Box sx={{ height: '100%' }}>
                <Div />
                <Container {...containerProps} sx={{ height: '100%' }}>
                  <NavigationTabs />
                  {arePluginsLoaded && (
                    <RouteSwitcher
                      requiresToken={() => {
                        const clusterName = getCluster() || '';
                        const cluster = clusters ? clusters[clusterName] : undefined;
                        return cluster?.useToken === undefined || cluster?.useToken;
                      }}
                    />
                  )}
                </Container>
              </Box>
            </Main>
            <ActivitiesRenderer />
            <DetailsDrawer />
          </Box>
          {panels.bottom.map(it => (
            <it.component key={it.id} />
          ))}
        </Box>
        {panels.right.map(it => (
          <it.component key={it.id} />
        ))}
      </Box>
    </>
  );
}
