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

import { Box } from '@mui/system';
import { memo, ReactElement, useEffect } from 'react';
import Deployment from '../../../lib/k8s/deployment';
import Job from '../../../lib/k8s/job';
import ReplicaSet from '../../../lib/k8s/replicaSet';
import ConfigDetails from '../../configmap/Details';
import { CustomResourceDetails } from '../../crd/CustomResourceDetails';
import CustomResourceDefinitionDetails from '../../crd/Details';
import CronJobDetails from '../../cronjob/Details';
import DaemonSetDetails from '../../daemonset/Details';
import EndpointDetails from '../../endpoints/Details';
import HpaDetails from '../../horizontalPodAutoscaler/Details';
import IngressClassDetails from '../../ingress/ClassDetails';
import IngressDetails from '../../ingress/Details';
import { LeaseDetails } from '../../lease/Details';
import { LimitRangeDetails } from '../../limitRange/Details';
import NamespaceDetails from '../../namespace/Details';
import { NetworkPolicyDetails } from '../../networkpolicy/Details';
import NodeDetails from '../../node/Details';
import PodDetails from '../../pod/Details';
import PDBDetails from '../../podDisruptionBudget/Details';
import PriorityClassDetails from '../../priorityClass/Details';
import ResourceQuotaDetails from '../../resourceQuota/Details';
import RoleBindingDetails from '../../role/BindingDetails';
import RoleDetails from '../../role/Details';
import { RuntimeClassDetails } from '../../runtimeClass/Details';
import SecretDetails from '../../secret/Details';
import ServiceDetails from '../../service/Details';
import ServiceAccountDetails from '../../serviceaccount/Details';
import StatefulSetDetails from '../../statefulset/Details';
import VolumeClaimDetails from '../../storage/ClaimDetails';
import StorageClassDetails from '../../storage/ClassDetails';
import VolumeDetails from '../../storage/VolumeDetails';
import VpaDetails from '../../verticalPodAutoscaler/Details';
import MutatingWebhookConfigList from '../../webhookconfiguration/MutatingWebhookConfigDetails';
import ValidatingWebhookConfigurationDetails from '../../webhookconfiguration/ValidatingWebhookConfigDetails';
import WorkloadDetails from '../../workload/Details';

const kindComponentMap: Record<
  string,
  (props: { name?: string; namespace?: string; cluster?: string }) => ReactElement
> = {
  Pod: PodDetails,
  Deployment: props => <WorkloadDetails {...props} workloadKind={Deployment} />,
  ReplicaSet: props => <WorkloadDetails {...props} workloadKind={ReplicaSet} />,
  Job: props => <WorkloadDetails {...props} workloadKind={Job} />,
  Service: ServiceDetails,
  CronJob: CronJobDetails,
  DaemonSet: DaemonSetDetails,
  ConfigMap: ConfigDetails,
  Endpoints: EndpointDetails,
  HorizontalPodAutoscaler: HpaDetails,
  Ingress: IngressDetails,
  Lease: LeaseDetails,
  LimitRange: LimitRangeDetails,
  Namespace: NamespaceDetails,
  NetworkPolicy: NetworkPolicyDetails,
  Node: NodeDetails,
  PodDisruptionBudget: PDBDetails,
  PriorityClass: PriorityClassDetails,
  ResourceQuota: ResourceQuotaDetails,
  ClusterRole: RoleDetails,
  Role: RoleDetails,
  RoleBinding: RoleBindingDetails,
  RuntimeClass: RuntimeClassDetails,
  Secret: SecretDetails,
  ServiceAccount: ServiceAccountDetails,
  StatefulSet: StatefulSetDetails,
  PersistentVolumeClaim: VolumeClaimDetails,
  StorageClass: StorageClassDetails,
  PersistentVolume: VolumeDetails,
  VerticalPodAutoscaler: VpaDetails,
  MutatingWebhookConfiguration: MutatingWebhookConfigList,
  ValidatingWebhookConfiguration: ValidatingWebhookConfigurationDetails,
  IngressClass: IngressClassDetails,
  CustomResourceDefinition: CustomResourceDefinitionDetails,
  crd: CustomResourceDefinitionDetails,
};

export const canRenderDetails = (maybeKind: string) =>
  maybeKind === 'customresource' ||
  Object.entries(kindComponentMap).find(
    ([key]) => key.toLowerCase() === maybeKind?.toLowerCase()
  ) !== undefined;

function DetailsNotFound() {
  return null;
}

/**
 * Shows details page for a given Kube resource
 */
export const KubeObjectDetails = memo(
  ({
    resource,
    customResourceDefinition,
  }: {
    resource: {
      kind: string;
      cluster?: string;
      metadata: { name: string; namespace?: string };
    };
    customResourceDefinition?: string;
  }) => {
    const { cluster, kind } = resource;
    const { name, namespace } = resource.metadata;

    const Component =
      Object.entries(kindComponentMap).find(
        ([key]) => key.toLowerCase() === kind?.toLowerCase()
      )?.[1] ?? DetailsNotFound;

    const content = customResourceDefinition ? (
      <CustomResourceDetails
        crName={name}
        crd={customResourceDefinition}
        namespace={namespace!}
        cluster={cluster}
      />
    ) : (
      <Component name={name} namespace={namespace} cluster={cluster} />
    );

    useEffect(() => {
      if (!kindComponentMap[kind]) {
        console.error(
          `No details component for kind ${kind} was found. See KubeNodeDetails.tsx for more info`
        );
      }
    }, [kind, kindComponentMap]);

    return (
      <Box sx={{ overflow: 'hidden' }}>
        <Box sx={{ marginTop: '-70px' }}>{content}</Box>
      </Box>
    );
  }
);
