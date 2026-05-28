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

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import type { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { KubeContainer } from '../../lib/k8s/cluster';
import JobSet from '../../lib/k8s/jobSet';
import type { KubeObject } from '../../lib/k8s/KubeObject';
import type Pod from '../../lib/k8s/pod';
import {
  ConditionsSection,
  ContainerInfo,
  DetailsGrid,
  OwnedJobsSection,
  OwnedPodsSection,
} from '../common/Resource';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';
import { WorkloadDiagnosticsSection } from '../diagnostics/Diagnostics';

/**
 * Section displaying the replicated jobs within a JobSet.
 *
 * @param props - Component properties
 * @param props.resource - The JobSet resource
 */
function ReplicatedJobsSection(props: { resource: JobSet }) {
  const { resource } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  if (!resource || !resource.spec?.replicatedJobs) {
    return null;
  }

  return (
    <SectionBox title={t('glossary|Replicated Jobs')}>
      <SimpleTable
        data={resource.spec.replicatedJobs}
        columns={[
          {
            label: t('translation|Name'),
            getter: job => job.name,
          },
          {
            label: t('glossary|Replicas'),
            getter: job => job.replicas,
          },
        ]}
      />
    </SectionBox>
  );
}

/**
 * Section displaying the containers within a JobSet's replicated jobs.
 *
 * @param props - Component properties
 * @param props.resource - The JobSet resource
 */
function JobSetContainersSection(props: { resource: JobSet }) {
  const { resource } = props;
  const { t } = useTranslation('glossary');

  const containers: { container: KubeContainer; replicatedJobName: string }[] = [];
  resource.spec?.replicatedJobs?.forEach((rj: any) => {
    rj.template?.spec?.template?.spec?.containers?.forEach((c: KubeContainer) => {
      containers.push({ container: c, replicatedJobName: rj.name });
    });
  });

  if (containers.length === 0) {
    return null;
  }

  return (
    <SectionBox title={t('Containers')}>
      {containers.map(({ container, replicatedJobName }) => (
        <ContainerInfo
          key={`${replicatedJobName}_${container.name}`}
          resource={resource}
          container={{ ...container, name: `${replicatedJobName}/${container.name}` }}
        />
      ))}
    </SectionBox>
  );
}

/**
 * Detailed view for a JobSet resource.
 *
 * @param props - Component properties
 * @param props.name - Name of the JobSet
 * @param props.namespace - Namespace of the JobSet
 * @param props.cluster - Cluster of the JobSet
 */
export default function JobSetDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;

  const [ownedPodsState, setOwnedPodsState] = React.useState<{
    workloadUid?: string;
    pods: Pod[] | null;
    errors: ApiError[] | null;
  }>({ pods: null, errors: null });

  const handleOwnedPodsUpdate = React.useCallback(
    (resource: KubeObject, pods: Pod[] | null, errors: ApiError[] | null) => {
      setOwnedPodsState({
        workloadUid: resource.metadata.uid,
        pods,
        errors,
      });
    },
    []
  );

  return (
    <DetailsGrid
      resourceType={JobSet}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      onResourceUpdate={item => {
        setOwnedPodsState(prev =>
          prev.workloadUid === item?.metadata.uid
            ? prev
            : { workloadUid: item?.metadata.uid, pods: null, errors: null }
        );
      }}
      extraSections={item =>
        item && [
          {
            id: 'headlamp.jobset-diagnostics',
            section: (
              <WorkloadDiagnosticsSection
                workload={item}
                pods={ownedPodsState.workloadUid === item.metadata.uid ? ownedPodsState.pods : null}
                errors={
                  ownedPodsState.workloadUid === item.metadata.uid ? ownedPodsState.errors : null
                }
              />
            ),
          },
          {
            id: 'headlamp.jobset-replicated-jobs',
            section: <ReplicatedJobsSection resource={item} />,
          },
          {
            id: 'headlamp.jobset-owned-jobs',
            section: <OwnedJobsSection resource={item} />,
          },
          {
            id: 'headlamp.jobset-owned-pods',
            section: <OwnedPodsSection resource={item} onPodsUpdate={handleOwnedPodsUpdate} />,
          },
          {
            id: 'headlamp.jobset-conditions',
            section: <ConditionsSection resource={item.jsonData} />,
          },
          {
            id: 'headlamp.jobset-containers',
            section: <JobSetContainersSection resource={item} />,
          },
        ]
      }
    />
  );
}
