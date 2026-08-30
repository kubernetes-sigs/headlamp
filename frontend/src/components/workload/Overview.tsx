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
import { uniqBy } from 'lodash';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { hasListResults } from '../../lib/k8s/api/v2/useKubeObjectList';
import CronJob from '../../lib/k8s/cronJob';
import DaemonSet from '../../lib/k8s/daemonSet';
import Deployment from '../../lib/k8s/deployment';
import Job from '../../lib/k8s/job';
import JobSet from '../../lib/k8s/jobSet';
import LeaderWorkerSet from '../../lib/k8s/leaderWorkerSet';
import Pod from '../../lib/k8s/pod';
import ReplicaSet from '../../lib/k8s/replicaSet';
import StatefulSet from '../../lib/k8s/statefulSet';
import type { Workload, WorkloadClass } from '../../lib/k8s/Workload';
import { getReadyReplicas, getTotalReplicas } from '../../lib/util';
import { useNamespaces } from '../../redux/filterSlice';
import { ClusterGroupErrorMessage } from '../cluster/ClusterGroupErrorMessage';
import Link from '../common/Link';
import { PageGrid } from '../common/Resource';
import ResourceListView from '../common/Resource/ResourceListView';
import { SectionBox } from '../common/SectionBox';
import TileChart from '../common/TileChart';
import { WorkloadCircleChart } from './Charts';

interface WorkloadDict {
  [key: string]: Workload[];
}

export default function Overview() {
  const namespaces = useNamespaces();

  const listOptions = { namespace: namespaces };
  // A list fans out over the namespaces and clusters it was asked for and reports an error
  // for each request that failed, so every query is kept whole. Reading only the first error
  // hides a later failure with another status, and with it the hint its status would raise.
  const podsQuery = Pod.useList(listOptions);
  const deploymentsQuery = Deployment.useList(listOptions);
  const statefulSetsQuery = StatefulSet.useList(listOptions);
  const daemonSetsQuery = DaemonSet.useList(listOptions);
  const replicaSetsQuery = ReplicaSet.useList(listOptions);
  const jobsQuery = Job.useList(listOptions);
  const cronJobsQuery = CronJob.useList(listOptions);
  const jobSetsQuery = JobSet.useList(listOptions);
  const leaderWorkerSetsQuery = LeaderWorkerSet.useList(listOptions);

  const pods = podsQuery.items;
  const deployments = deploymentsQuery.items;
  const statefulSets = statefulSetsQuery.items;
  const daemonSets = daemonSetsQuery.items;
  const replicaSets = replicaSetsQuery.items;
  const jobs = jobsQuery.items;
  const cronJobs = cronJobsQuery.items;
  const jobSets = jobSetsQuery.items;
  const leaderWorkerSets = leaderWorkerSetsQuery.items;

  // A namespace that answered with nothing contributes a real zero, so the charts go by
  // whether any request answered rather than by whether the answer holds an item.
  const workloadHasData: Record<string, boolean> = {
    [Pod.className]: hasListResults(podsQuery),
    [Deployment.className]: hasListResults(deploymentsQuery),
    [StatefulSet.className]: hasListResults(statefulSetsQuery),
    [DaemonSet.className]: hasListResults(daemonSetsQuery),
    [ReplicaSet.className]: hasListResults(replicaSetsQuery),
    [Job.className]: hasListResults(jobsQuery),
    [CronJob.className]: hasListResults(cronJobsQuery),
    [JobSet.className]: hasListResults(jobSetsQuery),
    [LeaderWorkerSet.className]: hasListResults(leaderWorkerSetsQuery),
  };

  const workloadErrors: Record<string, ApiError[] | null> = {
    [Pod.className]: podsQuery.errors,
    [Deployment.className]: deploymentsQuery.errors,
    [StatefulSet.className]: statefulSetsQuery.errors,
    [DaemonSet.className]: daemonSetsQuery.errors,
    [ReplicaSet.className]: replicaSetsQuery.errors,
    [Job.className]: jobsQuery.errors,
    [CronJob.className]: cronJobsQuery.errors,
    [JobSet.className]: jobSetsQuery.errors,
    [LeaderWorkerSet.className]: leaderWorkerSetsQuery.errors,
  };

  const listErrors = useMemo(
    () =>
      uniqBy(
        [
          podsQuery.errors,
          deploymentsQuery.errors,
          statefulSetsQuery.errors,
          daemonSetsQuery.errors,
          replicaSetsQuery.errors,
          jobsQuery.errors,
          cronJobsQuery.errors,
          jobSetsQuery.errors,
          leaderWorkerSetsQuery.errors,
        ].flatMap(errors => errors ?? []),
        error => error.status
      ),
    [
      podsQuery.errors,
      deploymentsQuery.errors,
      statefulSetsQuery.errors,
      daemonSetsQuery.errors,
      replicaSetsQuery.errors,
      jobsQuery.errors,
      cronJobsQuery.errors,
      jobSetsQuery.errors,
      leaderWorkerSetsQuery.errors,
    ]
  );

  const workloadsData: WorkloadDict = useMemo(
    () => ({
      Pod: pods ?? [],
      Deployment: deployments ?? [],
      StatefulSet: statefulSets ?? [],
      DaemonSet: daemonSets ?? [],
      ReplicaSet: replicaSets ?? [],
      Job: jobs ?? [],
      CronJob: cronJobs ?? [],
      JobSet: jobSets ?? [],
      LeaderWorkerSet: leaderWorkerSets ?? [],
    }),
    [
      pods,
      deployments,
      statefulSets,
      daemonSets,
      replicaSets,
      jobs,
      cronJobs,
      jobSets,
      leaderWorkerSets,
    ]
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
    JobSet,
    LeaderWorkerSet,
  ];

  const workloadLabel = {
    [Pod.className]: t('glossary|Pods'),
    [Deployment.className]: t('glossary|Deployments'),
    [StatefulSet.className]: t('glossary|Stateful Sets'),
    [DaemonSet.className]: t('glossary|Daemon Sets'),
    [ReplicaSet.className]: t('glossary|Replica Sets'),
    [Job.className]: t('glossary|Jobs'),
    [CronJob.className]: t('glossary|Cron Jobs'),
    [JobSet.className]: t('glossary|Job Sets'),
    [LeaderWorkerSet.className]: t('glossary|Leader Worker Sets'),
  };

  function ChartLink({ workload }: { workload: WorkloadClass }) {
    return <Link routeName={workload.pluralName}>{workloadLabel[workload.className]}</Link>;
  }

  // Workloads that classify health per item instead of by replica match.
  // Jobs/CronJobs/JobSets have no replica fields (like Pods). Leader worker sets
  // do have them, but a plain ready/desired comparison can't tell a partially
  // ready group apart from a failed one, nor spot a rollout in progress.
  const perItemHealth: Record<
    string,
    ((item: Workload) => ReturnType<Job['getHealth']>) | undefined
  > = {
    [Job.className]: item => (item as Job).getHealth(),
    [CronJob.className]: item => (item as CronJob).getHealth(),
    [JobSet.className]: item => (item as JobSet).getHealth(),
    [LeaderWorkerSet.className]: item => (item as LeaderWorkerSet).getHealth(),
  };

  return (
    <PageGrid>
      <SectionBox py={2} mt={1}>
        <ClusterGroupErrorMessage errors={listErrors} namespacedResource />
        <Grid container justifyContent="flex-start" alignItems="flex-start" spacing={2}>
          {workloads.map(workload => {
            const items = workloadsData[workload.className];
            const errors = workloadErrors[workload.className];

            return (
              <Grid item lg={3} md={4} xs={6} key={workload.className} style={{ minWidth: 0 }}>
                {!!errors?.length && !workloadHasData[workload.className] ? (
                  <TileChart
                    title={workloadLabel[workload.className]}
                    legend={t('translation|Unavailable')}
                  />
                ) : (
                  <WorkloadCircleChart
                    workloadData={items || null}
                    title={<ChartLink workload={workload} />}
                    partialLabel={t('translation|Failed')}
                    totalLabel={
                      workload === Pod || perItemHealth[workload.className]
                        ? t('translation|Healthy')
                        : t('translation|Running')
                    }
                    categorize={
                      workload === Pod
                        ? item => (item as Pod).getHealth()
                        : perItemHealth[workload.className]
                    }
                  />
                )}
              </Grid>
            );
          })}
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
