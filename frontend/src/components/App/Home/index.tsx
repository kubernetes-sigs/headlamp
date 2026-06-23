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

import { Icon } from '@iconify/react';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import { isEqual } from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { setupBackstageMessageReceiver } from '../../../helpers/backstageMessageReceiver';
import { useAutoConnectClusters } from '../../../helpers/clusterAutoConnect';
import { isBackstage } from '../../../helpers/isBackstage';
import { isElectron } from '../../../helpers/isElectron';
import { useClustersConf, useClustersVersion } from '../../../lib/k8s';
import { Cluster } from '../../../lib/k8s/cluster';
import { useEventWarningList } from '../../../lib/k8s/event';
import { createRouteURL } from '../../../lib/router/createRouteURL';
import { PageGrid } from '../../common/Resource';
import SectionBox from '../../common/SectionBox';
import { useLocalStorageState } from '../../globalSearch/useLocalStorageState';
import ProjectList from '../../project/ProjectList';
import ClusterTable from './ClusterTable';
import { ENABLE_RECENT_CLUSTERS } from './config';
import { getCustomClusterNames } from './customClusterNames';
import RecentClusters from './RecentClusters';

export default function Home() {
  const history = useHistory();
  const clusters = useClustersConf();

  if (!isElectron() && clusters && Object.keys(clusters).length === 1) {
    history.push(createRouteURL('cluster', { cluster: Object.keys(clusters)[0] }));
    return null;
  }

  return (
    <HomeComponent
      clusters={clusters}
      // Key forces a remount when the cluster list changes so HomeComponent
      // re-evaluates which clusters to connect. On-demand connected clusters
      // are preserved across remounts via sessionStorage in useAutoConnectClusters.
      key={
        'home-component-' +
        Object.keys(clusters || {})
          .sort()
          .join(',')
      }
    />
  );
}

interface HomeComponentProps {
  clusters: { [name: string]: Cluster } | null;
}

const maxWarnings = 50;

function renderWarningsText(warnings: ReturnType<typeof useEventWarningList>, clusterName: string) {
  // Returns '⋯' for both "not fetched yet" (warnings[clusterName] === undefined)
  // and "query error". Callers that need to distinguish the two cases must check
  // warnings[clusterName] directly.
  const numWarnings = warnings[clusterName]?.error
    ? -1
    : warnings[clusterName]?.warnings?.length ?? -1;

  if (numWarnings === -1) {
    return '⋯';
  }
  if (numWarnings >= maxWarnings) {
    return `${maxWarnings}+`;
  }
  return numWarnings.toString();
}

function useWarningSettingsPerCluster(clusterNames: string[]) {
  const warningsMap = useEventWarningList(clusterNames);
  const [warningLabels, setWarningLabels] = React.useState<{ [cluster: string]: string }>({});

  React.useEffect(() => {
    setWarningLabels(currentWarningLabels => {
      const newWarningLabels: { [cluster: string]: string } = {};
      for (const cluster of clusterNames) {
        // Keep the last known count while the warnings query has no result yet
        // ('⋯' means loading or error), e.g. when it re-initialises as another
        // cluster connects, so connecting a cluster doesn't blank a loaded one.
        const newLabel = renderWarningsText(warningsMap, cluster);
        const previousLabel = currentWarningLabels[cluster];
        // Preserve the previous count only while loading (no result yet), so
        // connecting a cluster doesn't blank an already-loaded one. On error,
        // show '⋯' rather than leaving a stale count.
        const isLoading = warningsMap[cluster] === undefined;
        const preserve = newLabel === '⋯' && isLoading && previousLabel !== undefined;
        newWarningLabels[cluster] = preserve ? previousLabel : newLabel;
      }
      if (!isEqual(newWarningLabels, currentWarningLabels)) {
        return newWarningLabels;
      }
      return currentWarningLabels;
    });
  }, [warningsMap, clusterNames]);

  return warningLabels;
}

function HomeComponent(props: HomeComponentProps) {
  const [view, setView] = useLocalStorageState<'clusters' | 'projects'>(
    'home-tab-view',
    'clusters'
  );
  const { clusters } = props;
  const [customNameClusters, setCustomNameClusters] = React.useState(
    getCustomClusterNames(clusters)
  );
  const { t } = useTranslation(['translation', 'glossary']);
  // Only poll versions/warnings for auto-connect clusters (recently-used by
  // default, plus any connected on demand) to avoid a credential/exec process
  // per cluster on load.
  const allClusterNames = React.useMemo(
    () => Object.values(customNameClusters).map(c => c.name),
    [customNameClusters]
  );
  const { connect: handleConnectCluster, connectedClusters } =
    useAutoConnectClusters(allClusterNames);

  const autoConnectClusters = React.useMemo(
    () => Object.values(clusters || {}).filter(c => connectedClusters.has(c.name)),
    [clusters, connectedClusters]
  );

  const [versions, errors] = useClustersVersion(autoConnectClusters);

  const clusterNames = React.useMemo(
    () => allClusterNames.filter(name => connectedClusters.has(name)),
    [allClusterNames, connectedClusters]
  );

  const warningLabels = useWarningSettingsPerCluster(clusterNames);

  React.useEffect(() => {
    if (isBackstage()) {
      window.parent.postMessage({ type: 'HEADLAMP_READY' }, '*');
      return setupBackstageMessageReceiver();
    }
  }, []);

  React.useEffect(() => {
    setCustomNameClusters(currentNames => {
      if (isEqual(currentNames, getCustomClusterNames(clusters))) {
        return currentNames;
      }
      return getCustomClusterNames(clusters);
    });
  }, [clusters]);

  const memoizedComponent = React.useMemo(
    () => (
      <>
        {ENABLE_RECENT_CLUSTERS && (
          <RecentClusters clusters={Object.values(customNameClusters)} onButtonClick={() => {}} />
        )}
        <ClusterTable
          customNameClusters={customNameClusters}
          versions={versions}
          errors={errors}
          warningLabels={warningLabels}
          clusters={clusters}
          connectedClusterNames={connectedClusters}
          onConnectCluster={handleConnectCluster}
        />
      </>
    ),
    [
      customNameClusters,
      errors,
      versions,
      warningLabels,
      clusters,
      connectedClusters,
      handleConnectCluster,
    ]
  );

  return (
    <PageGrid>
      <SectionBox title="Home" headerProps={{ headerStyle: 'main' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={view} onChange={(_, newView) => setView(() => newView)}>
            <Tab
              value="clusters"
              label={
                <>
                  <Icon icon="mdi:hexagon-multiple-outline" />
                  <Typography>{t('All Clusters')}</Typography>
                </>
              }
              sx={{
                flexDirection: 'row',
                gap: 1,
                fontSize: '1.25rem',
              }}
            />
            <Tab
              value="projects"
              label={
                <>
                  <Icon icon="mdi:folder-multiple" />
                  <Typography>{t('Projects')}</Typography>
                </>
              }
              sx={{
                flexDirection: 'row',
                gap: 1,
                fontSize: '1.25rem',
              }}
            />
          </Tabs>
        </Box>

        {view === 'clusters' && memoizedComponent}
        {view === 'projects' && <ProjectList />}
      </SectionBox>
    </PageGrid>
  );
}
