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
 * The backend token to use when making API calls from Headlamp when running as an app.
 * The token is requested from the main process via IPC once the renderer is ready,
 * and stored for use in the getHeadlampAPIHeaders function below.
 *
 * The app also sets HEADLAMP_BACKEND_TOKEN in the headlamp-server environment,
 * which the server checks to validate requests containing this same token.
 *
 * For development, when running the frontend separately from the backend,
 * the token can be initialized from the REACT_APP_HEADLAMP_BACKEND_TOKEN
 * environment variable to authenticate API requests.
 */
let backendToken: string | null = import.meta.env.REACT_APP_HEADLAMP_BACKEND_TOKEN || null;

/**
 * Sets the backend token to use when making API calls from Headlamp when running as an app.
 *
 * This is not a K8s or OIDC token, but one that protects headlamp-server APIs.
 */
export function setBackendToken(token: string | null) {
  backendToken = import.meta.env.REACT_APP_HEADLAMP_BACKEND_TOKEN || token;
}

/**
 * Returns headers for making API calls to the headlamp-server backend.
 */
export function getHeadlampAPIHeaders(): { [key: string]: string } {
  if (backendToken === null) {
    return {};
  }

  return {
    'X-HEADLAMP_BACKEND-TOKEN': backendToken,
  };
}
