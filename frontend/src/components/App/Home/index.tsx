import { isEqual } from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { isElectron } from '../../../helpers/isElectron';
import { useClustersConf, useClustersVersion } from '../../../lib/k8s';
import { Cluster } from '../../../lib/k8s/cluster';
import Event from '../../../lib/k8s/event';
import { createRouteURL } from '../../../lib/router';
import { PageGrid, SectionBox, SectionFilterHeader } from '../../common';
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

  const memoizedComponent = React.useMemo(
    () => (
      <PageGrid>
        {ENABLE_RECENT_CLUSTERS && (
          <SectionBox headerProps={{ headerStyle: 'main' }} title={t('Home')}>
            <RecentClusters clusters={Object.values(customNameClusters)} onButtonClick={() => {}} />
          </SectionBox>
        )}
        <SectionBox
          title={
            ENABLE_RECENT_CLUSTERS ? (
              t('Home')
            ) : (
              <SectionFilterHeader
                title={t('All Clusters')}
                noNamespaceFilter
                headerStyle="subsection"
              />
            )
          }
          headerProps={ENABLE_RECENT_CLUSTERS ? { headerStyle: 'main' } : undefined}
        >
          <ClusterTable
            customNameClusters={customNameClusters}
            versions={versions}
            errors={errors}
            warningLabels={warningLabels}
            clusters={clusters}
          />
        </SectionBox>
      </PageGrid>
    ),
    [customNameClusters, errors, versions, warningLabels]
  );

  return memoizedComponent;
}
