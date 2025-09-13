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

import Grid from '@mui/material/Grid';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import CronJob from '../../lib/k8s/cronJob';
import DaemonSet from '../../lib/k8s/daemonSet';
import Deployment from '../../lib/k8s/deployment';
import Job from '../../lib/k8s/job';
import Pod from '../../lib/k8s/pod';
import ReplicaSet from '../../lib/k8s/replicaSet';
import StatefulSet from '../../lib/k8s/statefulSet';
import type { Workload, WorkloadClass } from '../../lib/k8s/Workload';
import { getReadyReplicas, getTotalReplicas } from '../../lib/util';
import Link from '../common/Link';
import { PageGrid } from '../common/Resource';
import ResourceListView from '../common/Resource/ResourceListView';
import { SectionBox } from '../common/SectionBox';
import { WorkloadCircleChart } from './Charts';

interface WorkloadDict {
  [key: string]: Workload[];
}

export default function Overview() {
  const [pods] = Pod.useList();
  const [deployments] = Deployment.useList();
  const [statefulSets] = StatefulSet.useList();
  const [daemonSets] = DaemonSet.useList();
  const [replicaSets] = ReplicaSet.useList();
  const [jobs] = Job.useList();
  const [cronJobs] = CronJob.useList();

  const workloadsData: WorkloadDict = useMemo(
    () => ({
      Pod: pods ?? [],
      Deployment: deployments ?? [],
      StatefulSet: statefulSets ?? [],
      DaemonSet: daemonSets ?? [],
      ReplicaSet: replicaSets ?? [],
      Job: jobs ?? [],
      CronJob: cronJobs ?? [],
    }),
    [pods, deployments, statefulSets, daemonSets, replicaSets, jobs, cronJobs]
  );

  const { t } = useTranslation('glossary');

  function getPods(item: Workload) {
    return `${getReadyReplicas(item)}/${getTotalReplicas(item)}`;
  }

  function sortByReplicas(w1: Workload, w2: Workload) {
    const totalReplicasDiff = getTotalReplicas(w1) - getTotalReplicas(w2);
    if (totalReplicasDiff === 0) {
      return getReadyReplicas(w1) - getReadyReplicas(w2);
    }

    return totalReplicasDiff;
  }

  // All items except the pods since those shouldn't be shown in the table (only the chart).
  const jointItems = React.useMemo(() => {
    let joint: Workload[] = [];

    // Get all items except the pods since those shouldn't be shown in the table (only the chart).
    for (const [key, items] of Object.entries(workloadsData)) {
      if (key === 'Pod') {
        continue;
      }
      joint = joint.concat(items);
    }

    joint = joint.filter(Boolean);

    // Return null if no items are yet loaded, so we show the spinner in the table.
    if (joint.some(it => it === undefined)) {
      return null;
    }

    return joint;
  }, [workloadsData]);

  const workloads: WorkloadClass[] = [
    Pod,
    Deployment,
    StatefulSet,
    DaemonSet,
    ReplicaSet,
    Job,
    CronJob,
  ];

  const workloadLabel = {
    [Pod.className]: t('glossary|Pods'),
    [Deployment.className]: t('glossary|Deployments'),
    [StatefulSet.className]: t('glossary|Stateful Sets'),
    [DaemonSet.className]: t('glossary|Daemon Sets'),
    [ReplicaSet.className]: t('glossary|Replica Sets'),
    [Job.className]: t('glossary|Jobs'),
    [CronJob.className]: t('glossary|Cron Jobs'),
  };

  function ChartLink({ workload }: { workload: WorkloadClass }) {
    return <Link routeName={workload.pluralName}>{workloadLabel[workload.className]}</Link>;
  }

  return (
    <PageGrid>
      <SectionBox py={2} mt={1}>
        <Grid container justifyContent="flex-start" alignItems="flex-start" spacing={2}>
          {workloads.map(workload => (
            <Grid item lg={3} md={4} xs={6} key={workload.className}>
              <WorkloadCircleChart
                workloadData={workloadsData[workload.className] || null}
                title={<ChartLink workload={workload} />}
                partialLabel={t('translation|Failed')}
                totalLabel={t('translation|Running')}
              />
            </Grid>
          ))}
        </Grid>
      </SectionBox>
      <ResourceListView
        title={t('Workloads')}
        reflectInURL
        columns={[
          'kind',
          {
            id: 'name',
            label: t('translation|Name'),
            gridTemplate: 'auto',
            getValue: item => item.metadata.name,
            render: item => <Link kubeObject={item} />,
          },
          'namespace',
          'cluster',
          {
            id: 'pods',
            label: t('Pods'),
            gridTemplate: 'min-content',
            getValue: item => item && getPods(item),
            sort: sortByReplicas,
          },
          'age',
        ]}
        data={jointItems}
        headerProps={{
          noNamespaceFilter: false,
        }}
        id="headlamp-workloads"
      />
    </PageGrid>
  );
}
