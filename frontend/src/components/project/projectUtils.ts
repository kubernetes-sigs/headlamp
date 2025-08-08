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

import { KubeObjectInterface } from '../../lib/k8s/KubeObject';
import { ProjectDefinition, ProjectLabelSelector } from '../../redux/projectsSlice';

/**
 * Check if a label selector matches a resource
 */
export function matchesLabelSelector(
  resource: KubeObjectInterface,
  selector: ProjectLabelSelector
): boolean {
  const labels = resource.metadata?.labels || {};
  const labelValue = labels[selector.key];

  switch (selector.operator) {
    case 'Equals':
      return labelValue === selector.value;
    case 'NotEquals':
      return labelValue !== selector.value;
    case 'Exists':
      return labelValue !== undefined;
    case 'NotExists':
      return labelValue === undefined;
    default:
      return false;
  }
}

/**
 * Check if a resource matches a project definition
 */
export function matchesProject(
  resource: KubeObjectInterface,
  project: ProjectDefinition,
  currentCluster?: string
): boolean {
  // Check cluster selectors
  if (project.clusterSelectors.length > 0 && currentCluster) {
    const matchesCluster = project.clusterSelectors.some(
      cluster => cluster.name === currentCluster
    );
    if (!matchesCluster) {
      return false;
    }
  }

  // Check namespace selectors
  if (project.namespaceSelectors.length > 0) {
    const resourceNamespace = resource.metadata?.namespace;
    const matchesNamespace = project.namespaceSelectors.some(
      ns => ns.name === resourceNamespace
    );
    if (!matchesNamespace) {
      return false;
    }
  }

  // Check label selectors
  if (project.labelSelectors.length > 0) {
    const matchesLabels = project.labelSelectors.every(
      selector => matchesLabelSelector(resource, selector)
    );
    if (!matchesLabels) {
      return false;
    }
  }

  // If no selectors are defined, don't match anything
  if (project.labelSelectors.length === 0 && project.namespaceSelectors.length === 0) {
    return false;
  }

  return true;
}

/**
 * Get all projects that match a given resource
 */
export function getProjectsForResource(
  resource: KubeObjectInterface,
  projects: { [projectId: string]: ProjectDefinition },
  currentCluster?: string
): ProjectDefinition[] {
  return Object.values(projects).filter(project =>
    matchesProject(resource, project, currentCluster)
  );
}

/**
 * Get all resources that match a project's selectors
 */
export function getProjectResources(project: ProjectDefinition, resources: KubeObjectInterface[], currentCluster?: string): KubeObjectInterface[] {
  return resources.filter(resource => matchesProject(resource, project, currentCluster));
}

/**
 * Group resources by their matching projects
 */
export function groupResourcesByProjects<T extends KubeObjectInterface>(
  resources: T[],
  projects: { [projectId: string]: ProjectDefinition }
): { [projectId: string]: T[] } {
  const grouped: { [projectId: string]: T[] } = {};

  // Initialize empty arrays for all projects
  Object.keys(projects).forEach(projectId => {
    grouped[projectId] = [];
  });

  // Group resources by matching projects
  resources.forEach(resource => {
    const matchingProjects = getProjectsForResource(resource, projects);
    matchingProjects.forEach(project => {
      grouped[project.id].push(resource);
    });
  });

  return grouped;
}

/**
 * Create a default project definition for resources with app.kubernetes.io/name label
 */
export function createDefaultAppProject(appName: string): Omit<ProjectDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: appName,
    description: `Project for ${appName} application`,
    color: '#1976d2',
    icon: 'mdi:application',
    labelSelectors: [
      {
        key: 'app.kubernetes.io/name',
        value: appName,
        operator: 'Equals',
      },
    ],
    namespaceSelectors: [],
    clusterSelectors: [],
  };
}
