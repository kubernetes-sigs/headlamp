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

import { Box, Tab, Tabs } from '@mui/material';
import { ReactNode, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClusterSourceView,
  getClusterSource,
  getClusterSourceViews,
  translateClusterLabel,
} from '../../../helpers/clusterPresentation';
import { Cluster } from '../../../lib/k8s/cluster';
import { TabPanel } from '../../common/Tabs';
import { useLocalStorageState } from '../../globalSearch/useLocalStorageState';

export interface ClusterSourceTabsProps {
  /** The connections to count and to find sources in. */
  clusters: Cluster[];
  /** Whether the connections are still loading. The saved tab is kept in the meantime. */
  loading?: boolean;
  /** Source definitions from the backend config. */
  sources: ClusterSourceView[];
  /** Renders the selected tab. Receives the tab's source, or nothing for the All tab. */
  children: (source?: ClusterSourceView) => ReactNode;
}

/**
 * Tabs for the home page: All, followed by one tab per cluster source. The selected tab
 * is saved in local storage.
 */
export default function ClusterSourceTabs({
  clusters,
  sources,
  children,
  loading,
}: ClusterSourceTabsProps) {
  const { t } = useTranslation();
  const id = useId();
  const [selected, setSelected] = useLocalStorageState('home-cluster-source', '');
  const views = getClusterSourceViews(clusters, sources);
  const source = views.find(view => view.id === selected);
  const value = source?.id || '';
  const panels = [undefined, ...views];
  const activeIndex = source ? views.indexOf(source) + 1 : 0;
  const advertised = sources.some(view => view.id === selected);
  useEffect(() => {
    // An advertised source can still gain connections after /config, such as Plugin
    // connections restored from IndexedDB, so only forget sources the backend dropped.
    if (!loading && selected && !source && !advertised) setSelected('');
  }, [selected, source, advertised, loading, setSelected]);
  return (
    <>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={value}
          onChange={(_, next) => setSelected(next)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label={t('Cluster sources')}
        >
          {panels.map((view, index) => (
            <Tab
              key={view?.id || ''}
              value={view?.id || ''}
              id={`${id}-tab-${index}`}
              aria-controls={`${id}-panel-${index}`}
              label={`${translateClusterLabel(view?.label || 'All', t)} (${
                view
                  ? clusters.filter(cluster => getClusterSource(cluster) === view.id).length
                  : clusters.length
              })`}
            />
          ))}
        </Tabs>
      </Box>
      {panels.map((view, index) => (
        <TabPanel
          key={view?.id || ''}
          activeValue={activeIndex}
          index={index}
          id={`${id}-panel-${index}`}
          labeledBy={`${id}-tab-${index}`}
        >
          {index === activeIndex ? children(view) : null}
        </TabPanel>
      ))}
    </>
  );
}
