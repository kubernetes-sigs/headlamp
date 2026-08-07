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
import CronJob from '../../lib/k8s/cronJob';
import DaemonSet from '../../lib/k8s/daemonSet';
import Deployment from '../../lib/k8s/deployment';
import Job from '../../lib/k8s/job';
import JobSet from '../../lib/k8s/jobSet';
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
  const [pods, podsError] = Pod.useList(listOptions);
  const [deployments, deploymentsError] = Deployment.useList(listOptions);
  const [statefulSets, statefulSetsError] = StatefulSet.useList(listOptions);
  const [daemonSets, daemonSetsError] = DaemonSet.useList(listOptions);
  const [replicaSets, replicaSetsError] = ReplicaSet.useList(listOptions);
  const [jobs, jobsError] = Job.useList(listOptions);
  const [cronJobs, cronJobsError] = CronJob.useList(listOptions);
  const [jobSets, jobSetsError] = JobSet.useList(listOptions);

  const workloadErrors: Record<string, ApiError | null> = {
    [Pod.className]: podsError,
    [Deployment.className]: deploymentsError,
    [StatefulSet.className]: statefulSetsError,
    [DaemonSet.className]: daemonSetsError,
    [ReplicaSet.className]: replicaSetsError,
    [Job.className]: jobsError,
    [CronJob.className]: cronJobsError,
    [JobSet.className]: jobSetsError,
  };

  const listErrors = useMemo(
    () =>
      uniqBy(
        [
          podsError,
          deploymentsError,
          statefulSetsError,
          daemonSetsError,
          replicaSetsError,
          jobsError,
          cronJobsError,
          jobSetsError,
        ].filter((error): error is ApiError => !!error),
        error => error.status
      ),
    [
      podsError,
      deploymentsError,
      statefulSetsError,
      daemonSetsError,
      replicaSetsError,
      jobsError,
      cronJobsError,
      jobSetsError,
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
    }),
    [pods, deployments, statefulSets, daemonSets, replicaSets, jobs, cronJobs, jobSets]
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
  };

  function ChartLink({ workload }: { workload: WorkloadClass }) {
    return <Link routeName={workload.pluralName}>{workloadLabel[workload.className]}</Link>;
  }

  // Jobs/CronJobs/JobSets have no replica fields either (like Pods), so they
  // classify health per item instead of by replica match.
  const jobHealth: Record<string, ((item: Workload) => ReturnType<Job['getHealth']>) | undefined> =
    {
      [Job.className]: item => (item as Job).getHealth(),
      [CronJob.className]: item => (item as CronJob).getHealth(),
      [JobSet.className]: item => (item as JobSet).getHealth(),
    };

  return (
    <PageGrid>
      <SectionBox py={2} mt={1}>
        <ClusterGroupErrorMessage errors={listErrors} namespacedResource />
        <Grid container justifyContent="flex-start" alignItems="flex-start" spacing={2}>
          {workloads.map(workload => {
            const items = workloadsData[workload.className];
            const error = workloadErrors[workload.className];

            return (
              <Grid item lg={3} md={4} xs={6} key={workload.className} style={{ minWidth: 0 }}>
                {error && !items.length ? (
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
                      workload === Pod || jobHealth[workload.className]
                        ? t('translation|Healthy')
                        : t('translation|Running')
                    }
                    categorize={
                      workload === Pod
                        ? item => (item as Pod).getHealth()
                        : jobHealth[workload.className]
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
