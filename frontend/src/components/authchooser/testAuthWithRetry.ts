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

import { testAuth } from '../../lib/k8s/api/v1/clusterApi';
import type { ApiError } from '../../lib/k8s/api/v2/ApiError';

/** Statuses that mean the request never reached the cluster, so it may still succeed. */
export const TRANSIENT_STATUSES = [408, 502, 504];

/**
 * Timeout for the retry. Shorter than the first attempt so that a cluster which hangs
 * rather than refusing outright still reports its failure promptly.
 */
const RETRY_TIMEOUT = 3 * 1000;

/**
 * Tests auth, retrying once when the request never reached the cluster. A timed-out or
 * unreachable request says nothing about whether the cluster needs a token, and failing
 * on the first one interrupts a session that is otherwise working.
 */
export async function testAuthWithRetry(clusterName: string) {
  try {
    return await testAuth(clusterName);
  } catch (err) {
    const status = (err as ApiError).status;
    if (status === undefined || !TRANSIENT_STATUSES.includes(status)) {
      throw err;
    }

    console.debug(`Retrying auth test for ${clusterName} after a transient failure:`, err);

    return testAuth(clusterName, undefined, RETRY_TIMEOUT);
  }
}
