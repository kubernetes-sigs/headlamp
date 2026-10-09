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

import ClusterRole from './clusterRole';
import ClusterRoleBinding from './clusterRoleBinding';
import ConfigMap from './configMap';
import ControllerRevision from './controllerRevision';
import CustomResourceDefinition from './crd';
import CronJob from './cronJob';
import DaemonSet from './daemonSet';
import Deployment from './deployment';
import Endpoints from './endpoints';
import EndpointSlice from './endpointSlices';
import Gateway from './gateway';
import GatewayClass from './gatewayClass';
import GRPCRoute from './grpcRoute';
import HPA from './hpa';
import HTTPRoute from './httpRoute';
import Ingress from './ingress';
import IngressClass from './ingressClass';
import Job from './job';
import JobSet from './jobSet';
import LeaderWorkerSet from './leaderWorkerSet';
import { Lease } from './lease';
import { LimitRange } from './limitRange';
import Namespace from './namespace';
import NetworkPolicy from './networkpolicy';
import Node from './node';
import PersistentVolume from './persistentVolume';
import PersistentVolumeClaim from './persistentVolumeClaim';
import Pod from './pod';
import PodDisruptionBudget from './podDisruptionBudget';
import PodGroup from './podGroup';
import PriorityClass from './priorityClass';
import ReplicaSet from './replicaSet';
import ResourceQuota from './resourceQuota';
import Role from './role';
import RoleBinding from './roleBinding';
import { RuntimeClass } from './runtime';
import SchedulingWorkload from './schedulingWorkload';
import Secret from './secret';
import Service from './service';
import ServiceAccount from './serviceAccount';
import StatefulSet from './statefulSet';
import StorageClass from './storageClass';
import TCPRoute from './tcpRoute';
import UDPRoute from './udpRoute';
import VolumeAttributesClass from './volumeAttributesClass';

export const ResourceClasses = {
  ClusterRole,
  ClusterRoleBinding,
  ConfigMap,
  ControllerRevision,
  get CustomResourceDefinition() {
    return CustomResourceDefinition;
  },
  CronJob,
  DaemonSet,
  Deployment,
  Endpoint: Endpoints,
  Endpoints,
  EndpointSlice,
  LimitRange,
  Lease,
  ResourceQuota,
  get HorizontalPodAutoscaler() {
    return HPA;
  },
  PodDisruptionBudget,
  PodGroup,
  PriorityClass,
  Ingress,
  IngressClass,
  Job,
  JobSet,
  LeaderWorkerSet,
  Namespace,
  NetworkPolicy,
  Node,
  PersistentVolume,
  PersistentVolumeClaim,
  Pod,
  ReplicaSet,
  Role,
  RoleBinding,
  RuntimeClass,
  Secret,
  Service,
  ServiceAccount,
  StatefulSet,
  StorageClass,
  VolumeAttributesClass,
  Gateway,
  GatewayClass,
  HTTPRoute,
  GRPCRoute,
  TCPRoute,
  UDPRoute,
  // Keyed by kind, so the scheduling.k8s.io Workload is registered as 'Workload'.
  Workload: SchedulingWorkload,
};
