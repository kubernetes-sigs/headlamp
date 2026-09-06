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

import { useQuery } from '@tanstack/react-query';
import { useSelectedClusters } from '.';
import PodGroup from './podGroup';

/**
 * Whether any selected cluster serves the workload aware scheduling APIs.
 *
 * The APIs are alpha and only served when the GenericWorkload feature gate is enabled,
 * so views built on them stay hidden on clusters that do not have it.
 * @returns true once a selected cluster is known to serve the APIs.
 */
export function useSchedulingApisEnabled(): boolean {
  const selectedClusters = useSelectedClusters();

  const { data: isEnabled = false } = useQuery({
    queryKey: ['schedulingWorkloadsEnabled', ...selectedClusters],
    queryFn: async () => {
      const enabledPerCluster = await Promise.all(
        selectedClusters.map(cluster => PodGroup.isEnabled(cluster))
      );
      return enabledPerCluster.some(Boolean);
    },
    enabled: selectedClusters.length > 0,
  });

  return isEnabled;
}
