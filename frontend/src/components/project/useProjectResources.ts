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

import { uniqBy } from 'lodash';
import { useMemo } from 'react';
import { apiResourceId } from '../../lib/k8s/api/v2/ApiResource';
import { ProjectDefinition, StringSelector } from '../../redux/projectsSlice';
import { useKubeLists } from '../advancedSearch/utils/useKubeLists';

const MAX_RESOURCES_TO_WATCH = 20;
const MAX_ITEMS = 1000;

/**
 * Load all kubernetes items for one or more projects
 *
 * @param projects - list of projects
 * @param refetchIntervalMs - How often to refresh resources if they exceed MAX_RESOURCES_TO_WATCH
 */
export function useProjectResources(
  projects: ProjectDefinition[] | ProjectDefinition,
  refetchIntervalMs: number = 60_000
) {
  const projectsArray = useMemo(
    () => (Array.isArray(projects) ? projects : [projects]),
    [projects]
  );
  const allProjectClusters = useMemo(
    () => [
      ...new Set<string>(
        projectsArray.flatMap(
          p => p.clusterSelectors.map((s: StringSelector) => s.value).filter(Boolean) as string[]
        )
      ),
    ],
    [projectsArray]
  );

  const resources = useMemo(() => {
    const allResources = projectsArray.flatMap(p => p.apiResources);

    return uniqBy(allResources, r => apiResourceId(r));
  }, [projectsArray]);

  const { items, errors, isLoading } = useKubeLists(
    resources,
    allProjectClusters,
    MAX_ITEMS,
    resources.length > MAX_RESOURCES_TO_WATCH ? refetchIntervalMs : undefined
  );

  return { items, errors, isLoading };
}
