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
import { ProjectDefinition, StringSelector } from '../../redux/projectsSlice';
import { getStatus, KubeObjectStatus } from '../resourceMap/nodes/KubeObjectStatus';

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

/**
 * Check if a label selector matches a resource
 */
export function matchesLabelSelector(
  resource: KubeObject,
  key: string,
  selector: StringSelector
): boolean {
  const labels = resource.metadata?.labels || {};
  const labelValue = labels[key];

  switch (selector.operator) {
    case 'Equals':
      return labelValue === selector.value;
    case 'NotEquals':
      return labelValue !== selector.value;
    default:
      return false;
  }
}

/**
 * Check if a resource matches a project definition
 */
export function matchesProject(resource: KubeObject, project: ProjectDefinition): boolean {
  // Check selected API resources
  if (project.apiResources.length > 0) {
    const matchesApiResource = project.apiResources.some(
      apiResource => apiResource.kind === resource.kind
    );

    if (!matchesApiResource) {
      return false;
    }
  }

  // Check cluster selectors
  if (project.clusterSelectors.length > 0) {
    const matchesCluster = project.clusterSelectors.some(
      cluster => cluster.value === resource.cluster
    );
    if (!matchesCluster) {
      return false;
    }
  }

  // Check namespace selectors
  if (project.namespaceSelectors.length > 0) {
    const resourceNamespace = resource.metadata?.namespace;
    const matchesNamespace = project.namespaceSelectors.some(ns => ns.value === resourceNamespace);
    if (!matchesNamespace) {
      return false;
    }
  }

  // Check label selectors
  if (Object.entries(project.labelSelectors).length > 0) {
    const matchesLabels = Object.entries(project.labelSelectors).every(([key, selector]) =>
      matchesLabelSelector(resource, key, selector)
    );
    if (!matchesLabels) {
      return false;
    }
  }

  // If no selectors are defined, don't match anything
  if (
    Object.entries(project.labelSelectors).length === 0 &&
    project.namespaceSelectors.length === 0
  ) {
    return false;
  }

  return true;
}

/**
 * Get all projects that match a given resource
 */
export function getProjectsForResource(
  resource: KubeObject,
  projects: { [projectId: string]: ProjectDefinition }
): ProjectDefinition[] {
  return Object.values(projects).filter(project => matchesProject(resource, project));
}

/**
 * Get all resources that match a project's selectors
 */
export function getProjectResources(
  project: ProjectDefinition,
  resources: KubeObject[]
): KubeObject[] {
  return resources.filter(resource => matchesProject(resource, project));
}

/**
 * Create a default project definition for resources with app.kubernetes.io/name label
 */
export function createDefaultAppProject(
  appName: string
): Omit<ProjectDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: appName,
    description: `Project for ${appName} application`,
    color: '#1976d2',
    icon: 'mdi:application',
    labelSelectors: {
      'app.kubernetes.io/name': {
        value: appName,
        operator: 'Equals',
      },
    },
    apiResources: [],
    namespaceSelectors: [],
    clusterSelectors: [],
  };
}

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
      pluralName: 'ingressclasses',
      singularName: 'ingressclass',
      kind: 'IngressClass',
      isNamespaced: false,
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
      apiVersion: 'storage.k8s.io/v1',
      version: 'v1',
      groupName: 'storage.k8s.io',
      pluralName: 'storageclasses',
      singularName: 'storageclass',
      kind: 'StorageClass',
      isNamespaced: false,
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
  ];

  return resources;
})();
