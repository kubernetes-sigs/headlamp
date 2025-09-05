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
import { isBackstage } from '../../../helpers/isBackstage';
import { isElectron } from '../../../helpers/isElectron';
import { useClustersConf, useClustersVersion } from '../../../lib/k8s';
import { Cluster } from '../../../lib/k8s/cluster';
import Event from '../../../lib/k8s/event';
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
  const [view, setView] = useLocalStorageState<'clusters' | 'projects'>(
    'home-tab-view',
    'clusters'
  );
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
    if (isBackstage()) {
      window.parent.postMessage({ type: 'HEADLAMP_READY' }, '*');
      setupBackstageMessageReceiver();
    }
  }, []);

  React.useEffect(() => {
    setCustomNameClusters(currentNames => {
      if (isEqual(currentNames, getCustomClusterNames(clusters))) {
        return currentNames;
      }
      return getCustomClusterNames(clusters);
    });
  }, [customNameClusters]);

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
        />
      </>
    ),
    [customNameClusters, errors, versions, warningLabels]
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
