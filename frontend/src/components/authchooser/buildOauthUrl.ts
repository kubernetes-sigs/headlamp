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
 * buildOauthUrl is the pure URL constructor used by AuthChooser to
 * produce the /oidc kickoff URL. Lives in its own file so unit tests can
 * import it without dragging in the full AuthChooser module graph (which
 * pulls in Redux, MUI, the k8s client layer, etc.).
 */
export function buildOauthUrl(
  appUrl: string,
  cluster: string,
  mode: 'popup' | 'fullPage',
  fromPath: string,
  fromSearch: string,
  currentPath: string,
  currentSearch: string,
  now: string
): string {
  let returnTo = '';
  if (fromPath) {
    returnTo = fromPath + (fromSearch || '');
  } else {
    returnTo = (currentPath || '') + (currentSearch || '');
  }

  // Strip any fragment defensively. The backend rejects "#" in returnTo
  // and fragments don't survive a server-side redirect anyway.
  if (returnTo) {
    const hash = returnTo.indexOf('#');
    if (hash >= 0) {
      returnTo = returnTo.slice(0, hash);
    }
  }

  // /auth itself is not a meaningful returnTo — it would just bounce the
  // user back into the chooser.
  if (returnTo === '/auth' || returnTo.startsWith('/auth?')) {
    returnTo = '';
  }

  const params = new URLSearchParams();
  params.set('cluster', cluster);
  params.set('mode', mode);
  params.set('dt', now);
  if (returnTo) {
    params.set('returnTo', returnTo);
  }

  return `${appUrl}oidc?${params.toString()}`;
}
