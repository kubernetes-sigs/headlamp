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
import { ProjectDefinition } from '../../redux/projectsSlice';
import { useKubeLists } from '../advancedSearch/utils/useKubeLists';
import { defaultApiResources } from './projectUtils';

const MAX_RESOURCES_TO_WATCH = 20;
const MAX_ITEMS = 1000;
const REFETCH_INTERVAL_MS = 60_000;

export function useProjectItems(
  project: ProjectDefinition,
  { disableWatch }: { disableWatch?: boolean } = { disableWatch: false }
) {
  const resources = useMemo(() => {
    const allResources = defaultApiResources;

    return uniqBy(allResources, r => apiResourceId(r));
  }, []);

  const { items, errors, isLoading } = useKubeLists(
    resources,
    project.clusters,
    MAX_ITEMS,
    disableWatch || resources.length > MAX_RESOURCES_TO_WATCH ? REFETCH_INTERVAL_MS : undefined,
    project.namespaces
  );

  return { items, errors, isLoading };
}
