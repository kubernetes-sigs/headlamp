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

import { countBy } from 'lodash';
import { ApiResource } from '../../lib/k8s/api/v2/ApiResource';
import { KubeObject } from '../../lib/k8s/KubeObject';
import Namespace from '../../lib/k8s/namespace';
import { getStatus, KubeObjectStatus } from '../resourceMap/nodes/KubeObjectStatus';

export const PROJECT_ID_LABEL = 'headlamp.dev/project-id';

export const getHealthIcon = (healthy: number, unhealthy: number, warning: number) => {
  if (healthy + unhealthy + warning === 0) return 'mdi:help-circle';
  if (unhealthy > 0) return 'mdi:alert-circle';
  if (warning > 0) return 'mdi:alert';
  return 'mdi:check-circle';
};

export const getResourcesByKind = (resources: KubeObject[], kind: string) => {
  return resources.filter(resource => resource.kind === kind);
};

// Calculate health status for the project
export const getResourcesHealth = (resources: KubeObject[]) =>
  countBy(resources, it => getStatus(it)) as Record<KubeObjectStatus, number>;

export const defaultApiResources = (() => {
  const resources: ApiResource[] = [
    {
      apiVersion: 'v1',
      version: 'v1',
      pluralName: 'configmaps',
      singularName: 'configmap',
      kind: 'ConfigMap',
      isNamespaced: true,
    },
    {
      apiVersion: 'v1',
      version: 'v1',
      pluralName: 'endpoints',
      singularName: 'endpoints',
      kind: 'Endpoints',
      isNamespaced: true,
    },
    {
      apiVersion: 'discovery.k8s.io/v1',
      version: 'v1',
      groupName: 'discovery.k8s.io',
      pluralName: 'endpointslices',
      singularName: 'endpointSlice',
      kind: 'EndpointSlice',
      isNamespaced: true,
    },
    {
      apiVersion: 'v1',
      version: 'v1',
      pluralName: 'persistentvolumeclaims',
      singularName: 'persistentvolumeclaim',
      kind: 'PersistentVolumeClaim',
      isNamespaced: true,
    },
    {
      apiVersion: 'v1',
      version: 'v1',
      pluralName: 'secrets',
      singularName: 'secret',
      kind: 'Secret',
      isNamespaced: true,
    },
    {
      apiVersion: 'v1',
      version: 'v1',
      pluralName: 'services',
      singularName: 'service',
      kind: 'Service',
      isNamespaced: true,
    },
    {
      apiVersion: 'apps/v1',
      version: 'v1',
      groupName: 'apps',
      pluralName: 'statefulsets',
      singularName: 'statefulset',
      kind: 'StatefulSet',
      isNamespaced: true,
    },
    {
      apiVersion: 'apps/v1',
      version: 'v1',
      groupName: 'apps',
      pluralName: 'replicasets',
      singularName: 'replicaset',
      kind: 'ReplicaSet',
      isNamespaced: true,
    },
    {
      apiVersion: 'apps/v1',
      version: 'v1',
      groupName: 'apps',
      pluralName: 'deployments',
      singularName: 'deployment',
      kind: 'Deployment',
      isNamespaced: true,
    },
    {
      apiVersion: 'apps/v1',
      version: 'v1',
      groupName: 'apps',
      pluralName: 'daemonsets',
      singularName: 'daemonset',
      kind: 'DaemonSet',
      isNamespaced: true,
    },
    {
      apiVersion: 'batch/v1',
      version: 'v1',
      groupName: 'batch',
      pluralName: 'jobs',
      singularName: 'job',
      kind: 'Job',
      isNamespaced: true,
    },
    {
      apiVersion: 'batch/v1',
      version: 'v1',
      groupName: 'batch',
      pluralName: 'cronjobs',
      singularName: 'cronjob',
      kind: 'CronJob',
      isNamespaced: true,
    },
    {
      apiVersion: 'networking.k8s.io/v1',
      version: 'v1',
      groupName: 'networking.k8s.io',
      pluralName: 'ingresses',
      singularName: 'ingress',
      kind: 'Ingress',
      isNamespaced: true,
    },
    {
      apiVersion: 'networking.k8s.io/v1',
      version: 'v1',
      groupName: 'networking.k8s.io',
      pluralName: 'networkpolicies',
      singularName: 'networkpolicy',
      kind: 'NetworkPolicy',
      isNamespaced: true,
    },

    {
      apiVersion: 'autoscaling/v2',
      version: 'v2',
      groupName: 'autoscaling',
      pluralName: 'horizontalpodautoscalers',
      singularName: 'horizontalpodautoscaler',
      kind: 'HorizontalPodAutoscaler',
      isNamespaced: true,
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      version: 'v1',
      groupName: 'rbac.authorization.k8s.io',
      pluralName: 'roles',
      singularName: 'role',
      kind: 'Role',
      isNamespaced: true,
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      version: 'v1',
      groupName: 'rbac.authorization.k8s.io',
      pluralName: 'rolebindings',
      singularName: 'rolebinding',
      kind: 'RoleBinding',
      isNamespaced: true,
    },
    {
      apiVersion: 'v1',
      version: 'v1',
      pluralName: 'resourcequotas',
      singularName: 'resourcequota',
      kind: 'ResourceQuota',
      isNamespaced: true,
    },
    {
      apiVersion: 'v1',
      version: 'v1',
      pluralName: 'limitranges',
      singularName: 'limitrange',
      kind: 'LimitRange',
      isNamespaced: true,
    },
  ];

  return resources;
})();

// Convert project name to Kubernetes-compatible format
export const toKubernetesName = (name: string): string => {
  const converted = name
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with dashes
    .replace(/[^a-z0-9-]/g, '-') // Replace other non-alphanumeric chars with dashes
    .replace(/-+/g, '-') // Replace multiple dashes with single dash
    .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
    .substring(0, 63); // Ensure max 63 characters for DNS-1123 compliance

  // Validate using existing Kubernetes validation
  return Namespace.isValidNamespaceFormat(converted) ? converted : '';
};
