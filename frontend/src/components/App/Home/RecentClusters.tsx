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

import { Button, Grid, ToggleButton as MuiToggledButton, ToggleButtonGroup } from '@mui/material';
import { styled } from '@mui/system';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, useHistory } from 'react-router-dom';
import { isElectron } from '../../../helpers/isElectron';
import { getRecentClusters, setRecentCluster } from '../../../helpers/recentClusters';
import { formatClusterPathParam, getClusterPrefixedPath } from '../../../lib/cluster';
import { Cluster } from '../../../lib/k8s/cluster';
import { createRouteURL } from '../../../lib/router';
import { MULTI_HOME_ENABLED } from './config';
import SquareButton from './SquareButton';
const ToggleButton = styled(MuiToggledButton)({
  textTransform: 'none',
});

interface ClusterButtonProps extends React.PropsWithChildren<{}> {
  /** The cluster to display this button for. */
  cluster: Cluster;
  /** Callback for when the button is clicked. */
  onClick?: (...args: any[]) => void;
  /** Ref to focus on mount. */
  focusedRef?: (node: any) => void;
}

function ClusterButton(props: ClusterButtonProps) {
  const { cluster, onClick = undefined, focusedRef } = props;

  return (
    <SquareButton
      focusRipple
      icon="mdi:kubernetes"
      label={cluster.name}
      ref={focusedRef}
      onClick={onClick}
    />
  );
}

export interface RecentClustersProps {
  /** The clusters available. So if there's a record of recent clusters, it'll try to use
   * them only if they exist, otherwise it'll just use the first 3 of the ones passed here.
   */
  clusters: Cluster[];
  /** Callback for when a cluster button is clicked. The button's respective cluster is passed as a parameter. */
  onButtonClick: (cluster: Cluster) => void;
}

export default function RecentClusters(props: RecentClustersProps) {
  const { clusters } = props;
  const history = useHistory();
  const focusedRef = React.useCallback((node: HTMLElement) => {
    if (node !== null) {
      node.focus();
    }
  }, []);
  const { t } = useTranslation('translation');
  const [selectedClusters, setSelectedClusters] = React.useState<Cluster[]>([]);

  const recentClustersLabelId = 'recent-clusters-label';
  const maxRecentClusters = 3;
  // We slice it here for the maximum recent clusters just for extra safety, since this
  // is an entry point to the rest of the functionality
  const recentClusterNames = getRecentClusters().slice(0, maxRecentClusters);

  let recentClusters: Cluster[] = [];

  // If we have more than the maximum number of recent clusters allowed, we show the most
  // recent ones. Otherwise, just show the clusters in the order they are received.
  if (clusters.length > maxRecentClusters) {
    // Get clusters matching the recent cluster names, if they exist still.
    recentClusters = recentClusterNames
      .map(name => clusters.find(cluster => cluster.name === name))
      .filter(item => !!item) as Cluster[];
    // See whether we need to fill with new clusters (when the recent clusters were less than the
    // maximum/wanted).
    const neededClusters = maxRecentClusters - recentClusters.length;
    if (neededClusters > 0) {
      recentClusters = recentClusters.concat(
        clusters.filter(item => !recentClusters.includes(item)).slice(0, neededClusters)
      );
    }
  } else {
    recentClusters = clusters;
  }

  function onClusterButtonClicked(cluster: Cluster) {
    setRecentCluster(cluster);
    history.push({
      pathname: generatePath(getClusterPrefixedPath(), {
        cluster: cluster.name,
      }),
    });
  }

  /**
   * Callback for when the "View" button is clicked. It will navigate to the selected clusters.
   */
  function onViewClusters() {
    selectedClusters.forEach(cluster => {
      setRecentCluster(cluster);
    });

    history.push({
      pathname: generatePath(getClusterPrefixedPath(), {
        cluster: formatClusterPathParam(selectedClusters.map(cluster => cluster.name)),
      }),
    });
  }

  const doMulti = recentClusters.length > 1 && MULTI_HOME_ENABLED;

  return (
    <Grid
      aria-labelledby={`#${recentClustersLabelId}`}
      item
      container
      alignItems="flex-start"
      spacing={2}
    >
      {!doMulti &&
        recentClusters.map((cluster, i) => (
          <Grid item key={cluster.name}>
            <ClusterButton
              focusedRef={i === 0 ? focusedRef : undefined}
              cluster={cluster}
              onClick={() => onClusterButtonClicked(cluster)}
            />
          </Grid>
        ))}
      {doMulti && (
        <Grid container item alignItems="center">
          <ToggleButtonGroup
            value={selectedClusters}
            onChange={(event, clusters) => setSelectedClusters(clusters)}
            aria-label={t('Selected clusters')}
            exclusive={false}
          >
            {recentClusters.map(cluster => (
              <ToggleButton key={cluster.name} value={cluster}>
                {cluster.name}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Grid item pl={2}>
            <Button
              variant="contained"
              disabled={selectedClusters.length < 1}
              color="primary"
              onClick={onViewClusters}
            >
              {t('View')}
            </Button>
          </Grid>
        </Grid>
      )}
      {isElectron() && (
        <Grid item>
          <SquareButton
            onClick={() => {
              history.push(createRouteURL('addCluster'));
            }}
            label={t('Load cluster')}
            icon="mdi:plus-circle-outline"
            primary
          />
        </Grid>
      )}
    </Grid>
  );
}
