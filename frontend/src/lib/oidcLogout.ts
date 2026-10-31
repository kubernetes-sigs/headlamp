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

import { Base64 } from 'js-base64';
import { getAppUrl } from '../helpers/getAppUrl';
import { getHeadlampAPIHeaders } from '../helpers/getHeadlampAPIHeaders';
import { backendFetch } from './k8s/api/v2/fetch';

export function encodeClusterPath(cluster: string): string {
  return Base64.encodeURI(cluster);
}

/**
 * Requests an OIDC logout transition URL through the authenticated backend and navigates to it.
 *
 * @param cluster - The OIDC cluster whose provider session should be ended.
 * @throws {Error} When the backend request fails or returns an invalid redirect URL.
 */
export async function redirectToOIDCLogout(cluster: string): Promise<void> {
  if (window.desktopApi?.oidcLogout) {
    await window.desktopApi.oidcLogout(cluster);
    return;
  }
  const response = await backendFetch(
    `/encoded-clusters/${encodeClusterPath(cluster)}/oidc-logout`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...getHeadlampAPIHeaders(),
      },
    }
  );
  const result: unknown = await response.json();

  if (
    !result ||
    typeof result !== 'object' ||
    !('redirectURL' in result) ||
    typeof result.redirectURL !== 'string' ||
    result.redirectURL === ''
  ) {
    throw new Error('OIDC logout response did not include a redirect URL');
  }

  window.location.href = new URL(result.redirectURL, getAppUrl()).href;
}
