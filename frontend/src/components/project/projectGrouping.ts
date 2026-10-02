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

import { groupBy, uniq, uniqBy } from 'lodash';
import type {
  ProjectDefinition,
  ProjectGrouping,
  ProjectNamespace,
  ProjectNamespaceReference,
} from '../../redux/projectsSlice';
import { PROJECT_ID_LABEL } from './projectUtils';

/**
 * Groups labelled namespaces into project entries.
 *
 * @param namespaces - Namespaces to group by project ID and optional custom key.
 * @param projectGrouping - Optional plugin-provided grouping behavior.
 * @returns Project entries with unique namespace, cluster, and namespace-reference lists.
 */
export function groupNamespacesIntoProjects(
  namespaces: ReadonlyArray<ProjectNamespace>,
  projectGrouping?: ProjectGrouping
): ProjectDefinition[] {
  const labelled = namespaces.filter(namespace => namespace.metadata.labels?.[PROJECT_ID_LABEL]);
  const grouped = groupBy(
    labelled.map(namespace => {
      const projectId = namespace.metadata.labels![PROJECT_ID_LABEL];
      const customKey = projectGrouping?.getProjectKey({ namespace, projectId });
      const key = typeof customKey === 'string' && customKey ? customKey : projectId;
      return { key, namespace, projectId };
    }),
    entry => JSON.stringify([entry.projectId, entry.key])
  );

  return Object.values(grouped).map(entries => {
    const { key, projectId: id } = entries[0];
    return {
      id,
      ...(key === id ? {} : { key }),
      namespaces: uniq(entries.map(entry => entry.namespace.metadata.name)),
      clusters: uniq(entries.map(entry => entry.namespace.cluster)),
      namespaceRefs: uniqBy(
        entries.map(({ namespace }) => ({
          name: namespace.metadata.name,
          cluster: namespace.cluster,
        })),
        namespaceRef => JSON.stringify([namespaceRef.cluster, namespaceRef.name])
      ),
    };
  });
}

/** A cluster and its project namespaces for an exact Kubernetes list request. */
export interface ProjectListRequest {
  /** Headlamp cluster name to query. */
  cluster: string;
  /** Project namespaces to query in the cluster. */
  namespaces: string[];
}

/**
 * Builds list requests without creating a Cartesian product of namespaces and clusters.
 *
 * @param project - Project whose namespaces should be queried.
 * @returns Namespace lists grouped by their exact cluster.
 */
export function projectListRequests(project: ProjectDefinition): ProjectListRequest[] {
  if (!project.namespaceRefs?.length) {
    return project.clusters.map(cluster => ({ cluster, namespaces: project.namespaces }));
  }

  return Object.entries(groupBy(project.namespaceRefs, namespaceRef => namespaceRef.cluster)).map(
    ([cluster, namespaceRefs]) => ({
      cluster,
      namespaces: uniq(namespaceRefs.map(namespaceRef => namespaceRef.name)),
    })
  );
}

/**
 * Checks whether a namespace belongs to the project using its exact cluster pair when available.
 *
 * @param project - Project to check.
 * @param namespace - Namespace reference to find in the project.
 * @returns Whether the namespace belongs to the project entry.
 */
export function projectIncludesNamespace(
  project: ProjectDefinition,
  namespace: ProjectNamespaceReference
): boolean {
  if (!project.namespaceRefs?.length) {
    return project.namespaces.includes(namespace.name);
  }

  return project.namespaceRefs.some(
    namespaceRef =>
      namespaceRef.name === namespace.name && namespaceRef.cluster === namespace.cluster
  );
}

/**
 * Selects a project entry for a project details route.
 *
 * @param projects - Available project entries.
 * @param name - Project ID from the route.
 * @param projectKey - Optional opaque key from the route query.
 * @returns The keyed match, the unkeyed default, or the first same-ID entry as a fallback.
 */
export function findProject(
  projects: ProjectDefinition[],
  name: string,
  projectKey: string | null
): ProjectDefinition | undefined {
  const matchingProjects = projects.filter(project => project.id === name);
  if (projectKey) {
    return matchingProjects.find(project => project.key === projectKey);
  }
  return matchingProjects.find(project => !project.key) ?? matchingProjects[0];
}

/** Query parameters used to select a grouped project entry. */
export interface ProjectLinkSearch {
  /** Opaque key that distinguishes project entries with the same project ID. */
  projectKey: string;
}

/**
 * Creates query parameters for a project details link.
 *
 * @param project - Project entry represented by the link.
 * @returns A project-key query when the entry has a custom key, otherwise `undefined`.
 */
export function projectLinkSearch(project: ProjectDefinition): ProjectLinkSearch | undefined {
  return project.key ? { projectKey: project.key } : undefined;
}
