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
 * Clusters whose first request has already settled. Requests for these clusters
 * are never queued.
 */
const contactedClusters = new Set<string>();

/**
 * The tail of the queue of first requests. Each new first request chains onto
 * it, which is what makes admission first-in-first-out.
 */
let queueTail: Promise<unknown> = Promise.resolve();

/**
 * Runs a cluster request, letting only one cluster make its *first* contact at
 * a time.
 *
 * The backend only answers a `/clusters/<name>/...` request once the kubeconfig
 * `exec` credential plugin for that cluster has finished. Such plugins (SSO
 * helpers like kubelogin, gcloud or aws) typically open a browser and bind a
 * fixed localhost redirect port, so running several at once makes the port
 * binds collide and every login fail. Ordering the first request per cluster
 * orders the plugin invocations, which keeps at most one interactive login
 * running.
 *
 * Only the first request per cluster is queued: once a cluster has answered
 * once its credentials are cached in the backend, so later requests run
 * immediately and in parallel as before.
 *
 * @param cluster - Name of the cluster, or empty for non-cluster requests.
 * @param run - Performs the request. Called immediately when no slot is needed.
 *
 * @returns Whatever `run` resolves or rejects with.
 */
export function withClusterConnectSlot<T>(
  cluster: string | null | undefined,
  run: () => Promise<T>
): Promise<T> {
  if (!cluster || contactedClusters.has(cluster)) {
    return run();
  }

  // The cluster is marked as contacted once the request settles, not once it
  // succeeds: a cluster whose login fails must release the queue instead of
  // holding up every other cluster.
  const slot = queueTail.then(() =>
    run().finally(() => {
      contactedClusters.add(cluster);
    })
  );

  // Swallow the rejection for the queue itself, so a failing request cannot
  // reject the slot of whichever cluster comes next.
  queueTail = slot.catch(() => {});

  return slot;
}

/**
 * Clears the queue and the set of contacted clusters.
 *
 * Only meant for tests, since the state above lives for as long as the page.
 */
export function resetClusterConnectQueue() {
  contactedClusters.clear();
  queueTail = Promise.resolve();
}
