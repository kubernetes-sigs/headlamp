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

/**
 * Handles the logic for updating the URL after a user logs out from a cluster.
 * If the user logs out from a specific cluster in a multi-cluster context,
 * it removes that cluster from the URL. Otherwise, it redirects to the home page.
 *
 * @param clusterToLogout - The name of the cluster the user is logging out from.
 * @param currentPath - The current URL path (e.g., from history.location.pathname).
 * @param historyPush - Function to navigate to a new path (e.g., history.push).
 */
export function handleLogoutPathUpdate(
  clusterToLogout: string | undefined,
  currentPath: string,
  historyPush: (path: string) => void
) {
  if (clusterToLogout) {
    const clusterSegmentMatch = currentPath.match(/\/c\/([^/]+)(\/|$)/);
    if (clusterSegmentMatch) {
      const currentClusterParam = clusterSegmentMatch[1];
      const clustersInPath = currentClusterParam.split('+');
      const remainingClustersInPath = clustersInPath.filter(c => c !== clusterToLogout);
      if (remainingClustersInPath.length > 0) {
        const newClusterParam = remainingClustersInPath.join('+');
        const newPath = currentPath.replace(`/c/${currentClusterParam}`, `/c/${newClusterParam}`);
        historyPush(newPath);
        return;
      }
    }
  }

  historyPush('/');
}
