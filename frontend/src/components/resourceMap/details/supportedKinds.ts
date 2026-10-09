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

export const supportedKinds = [
  'Pod',
  'Deployment',
  'ReplicaSet',
  'Job',
  'JobSet',
  'LeaderWorkerSet',
  'Service',
  'CronJob',
  'DaemonSet',
  'ConfigMap',
  'Endpoints',
  'EndpointSlice',
  'HorizontalPodAutoscaler',
  'Ingress',
  'Lease',
  'LimitRange',
  'Namespace',
  'NetworkPolicy',
  'Node',
  'PodDisruptionBudget',
  'PriorityClass',
  'ResourceQuota',
  'ClusterRole',
  'Role',
  'RoleBinding',
  'RuntimeClass',
  'Secret',
  'ServiceAccount',
  'StatefulSet',
  'PersistentVolumeClaim',
  'StorageClass',
  'VolumeAttributesClass',
  'PersistentVolume',
  'VerticalPodAutoscaler',
  'MutatingWebhookConfiguration',
  'ValidatingWebhookConfiguration',
  'IngressClass',
  'CustomResourceDefinition',
  'crd',
  'Gateway',
  'GatewayClass',
  'HTTPRoute',
  'GRPCRoute',
  'TCPRoute',
  'UDPRoute',
  'ReferenceGrant',
  'BackendTLSPolicy',
  'XBackendTrafficPolicy',
];

export const canRenderDetails = (maybeKind: string) =>
  maybeKind === 'customresource' ||
  supportedKinds.find(key => key.toLowerCase() === maybeKind?.toLowerCase()) !== undefined;
