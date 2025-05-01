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

/*
 * This module was taken from the k8dash project.
 */

import store from '../redux/stores/store';

export function getToken(cluster: string) {
  const getTokenMethodToUse = store.getState().ui.functionsToOverride.getToken;
  const tokenMethodToUse =
    getTokenMethodToUse ||
    function () {
      return getTokens()[cluster];
    };
  return tokenMethodToUse(cluster);
}

export function getUserInfo(cluster: string) {
  const user = getToken(cluster).split('.')[1];
  return JSON.parse(atob(user));
}

export function hasToken(cluster: string) {
  return !!getToken(cluster);
}

function getTokens() {
  return JSON.parse(localStorage.tokens || '{}');
}

export function setToken(cluster: string, token: string | null) {
  const setTokenMethodToUse = store.getState().ui.functionsToOverride.setToken;
  if (setTokenMethodToUse) {
    setTokenMethodToUse(cluster, token);
  } else {
    const tokens = getTokens();
    tokens[cluster] = token;
    localStorage.tokens = JSON.stringify(tokens);
  }
}

export function deleteTokens() {
  delete localStorage.tokens;
}

export function logout() {
  deleteTokens();
}
