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

import { Cluster } from '../lib/k8s/cluster';

/**
 * Determines whether app is running in electron environment.
 * Note: The isElectron code (Licence: MIT) is taken from
 *   https://github.com/cheton/is-electron/blob/master/index.js
 */
function isElectron(): boolean {
  // Renderer process
  if (
    typeof window !== 'undefined' &&
    typeof window.process === 'object' &&
    (window.process as any).type === 'renderer'
  ) {
    return true;
  }

  // Main process
  if (
    typeof process !== 'undefined' &&
    typeof process.versions === 'object' &&
    !!(process.versions as any).electron
  ) {
    return true;
  }

  // Detect the user agent when the `nodeIntegration` option is set to true
  if (
    typeof navigator === 'object' &&
    typeof navigator.userAgent === 'string' &&
    navigator.userAgent.indexOf('Electron') >= 0
  ) {
    return true;
  }

  return false;
}

/** used by isDebugVerbose and debugVerbose */
const verboseModDebug: string[] = [];

/**
 * To allow us to include verbose debug information for a module.
 *
 * - Gives us the line number and file of the log in developer console.
 *   If it was in a wrapper function it just shows the wrapper function line number.
 * - Turned off by default, and the message doesn't even get constructed if it's off.
 *   This is important do high frequency messages so not impact performance.
 * - ON/OFF via environment variable REACT_APP_DEBUG_VERBOSE='k8s/apiProxy'
 * - ON/OFF via code debugVerbose('k8s/apiProxy').
 *   So can easily turn it on when debugging.
 * - Also can turn on just a function debugVerbose('k8s/apiProxy@refreshToken')
 *
 * @param modName only show verbose debugging for this module name.
 * @returns true if verbose debugging should be done.
 *
 * @example
 *
 * To add some verbose debugging to a module:
 * ```ts
 * import { isDebugVerbose } from './helpers';
 * if (isDebugVerbose('k8s/apiProxy')) {
 *     console.debug('k8s/apiProxy', {dataToLog});
 * }
 * ```
 *
 * You can also include a symbol name:
 * ```ts
 * import { isDebugVerbose } from './helpers';
 * if (isDebugVerbose('k8s/apiProxy@refreshToken')) {
 *     console.debug('k8s/apiProxy@refreshToken', {dataToLog});
 * }
 * ```
 *
 * In that example:
 * - 'k8s/apiProxy' is the module name.
 * - 'refreshToken' is the function symbol name.
 *
 * To turn verbose debugging on via code in that module:
 * ```ts
 * import { debugVerbose } from './helpers';
 * debugVerbose('k8s/apiProxy')
 *
 * // or for everything in refreshToken:
 * debugVerbose('k8s/apiProxy@refreshToken')
 * ```
 *
 * To turn it on for multiple modules via environment variable:
 * ```bash
 * REACT_APP_DEBUG_VERBOSE="k8s/apiProxy i18n/config" make run-frontend
 * ```
 *
 * To turn it on via environment variable for all modules:
 * ```bash
 * REACT_APP_DEBUG_VERBOSE="all" make run-frontend
 * ```
 */
export function isDebugVerbose(modName: string): boolean {
  if (verboseModDebug.filter(mod => modName.indexOf(mod) > 0).length > 0) {
    return true;
  }

  return (
    import.meta.env.REACT_APP_DEBUG_VERBOSE === 'all' ||
    !!(
      import.meta.env.REACT_APP_DEBUG_VERBOSE &&
      import.meta.env.REACT_APP_DEBUG_VERBOSE?.indexOf(modName) !== -1
    )
  );
}

/**
 * debugVerbose turns on verbose debugging for a module.
 *
 * @param modName turn on verbose debugging for this module name.
 *
 * @see isDebugVerbose
 */
export function debugVerbose(modName: string): void {
  verboseModDebug.push(modName);
}

/**
 * isDockerDesktop checks if ddClient is available in the window object
 * if it is available then it is running in docker desktop
 *
 *
 * @returns true if Headlamp is running inside docker desktop
 */
function isDockerDesktop(): boolean {
  if (window?.ddClient === undefined) {
    return false;
  }
  return true;
}

export function getFilterValueByNameFromURL(key: string, location: any): string[] {
  const searchParams = new URLSearchParams(location.search);

  const filterValue = searchParams.get(key);
  if (!filterValue) {
    return [];
  }
  return filterValue.split(' ');
}

export function addQuery(
  queryObj: { [key: string]: string },
  queryParamDefaultObj: { [key: string]: string } = {},
  history: any,
  location: any,
  tableName = ''
) {
  const pathname = location.pathname;
  const searchParams = new URLSearchParams(location.search);

  if (!!tableName) {
    searchParams.set('tableName', tableName);
  }
  // Ensure that default values will not show up in the URL
  for (const key in queryObj) {
    const value = queryObj[key];
    if (value !== queryParamDefaultObj[key]) {
      searchParams.set(key, value);
    } else {
      searchParams.delete(key);
    }
  }

  history.push({
    pathname: pathname,
    search: searchParams.toString(),
  });
}

/**
 * @returns true if the app is in development mode.
 */
function isDevMode(): boolean {
  return import.meta.env.DEV;
}

/**
 * @returns URL depending on dev-mode/electron/docker desktop, base-url, and window.location.origin.
 *
 * @example isDevMode | isElectron returns 'http://localhost:4466/'
 * @example isDockerDesktop returns 'http://localhost:64446/'
 * @example base-url set as '/headlamp' returns '/headlamp/'
 * @example isDevMode | isElectron and base-url is set
 *          it returns 'http://localhost:4466/headlamp/'
 * @example returns 'https://headlamp.example.com/'using the window.location.origin of browser
 *
 */
function getAppUrl(): string {
  let url =
    exportFunctions.isDevMode() || exportFunctions.isElectron()
      ? 'http://localhost:4466'
      : window.location.origin;
  if (exportFunctions.isDockerDesktop()) {
    url = 'http://localhost:64446';
  }

  const baseUrl = exportFunctions.getBaseUrl();
  url += baseUrl ? baseUrl + '/' : '/';

  return url;
}

declare global {
  interface Window {
    headlampBaseUrl?: string;
    Buffer: typeof Buffer;
    clusterConfigFetchHandler: number;
    ddClient: any | undefined;
  }
}

/**
 * @returns the baseUrl for the app based on window.headlampBaseUrl or import.meta.env.PUBLIC_URL
 *
 * This could be either '' meaning /, or something like '/headlamp'.
 */
function getBaseUrl(): string {
  let baseUrl = '';
  if (exportFunctions.isElectron()) {
    return '';
  }
  if (window?.headlampBaseUrl !== undefined) {
    baseUrl = window.headlampBaseUrl;
  } else {
    baseUrl = import.meta.env.PUBLIC_URL ? import.meta.env.PUBLIC_URL : '';
  }

  if (baseUrl === './' || baseUrl === '.' || baseUrl === '/') {
    baseUrl = '';
  }
  return baseUrl;
}
function getAppVersion() {
  return localStorage.getItem('app_version');
}

function setAppVersion(value: string) {
  localStorage.setItem('app_version', value);
}

const recentClustersStorageKey = 'recent_clusters';

/**
 * Adds the cluster name to the list of recent clusters in localStorage.
 *
 * @param cluster - the cluster to add to the list of recent clusters. Can be the name, or a Cluster object.
 * @returns void
 */
function setRecentCluster(cluster: string | Cluster) {
  const recentClusters = getRecentClusters();
  const clusterName = typeof cluster === 'string' ? cluster : cluster.name;
  const currentClusters = recentClusters.filter(name => name !== clusterName);
  const newClusters = [clusterName, ...currentClusters].slice(0, 3);
  localStorage.setItem(recentClustersStorageKey, JSON.stringify(newClusters));
}

/**
 * @returns the list of recent clusters from localStorage.
 */
function getRecentClusters() {
  const currentClustersStr = localStorage.getItem(recentClustersStorageKey) || '[]';
  const recentClusters = JSON.parse(currentClustersStr) as string[];

  if (!Array.isArray(recentClusters)) {
    return [];
  }

  return recentClusters;
}

const tablesRowsPerPageKey = 'tables_rows_per_page';

function getTablesRowsPerPage(defaultRowsPerPage: number = 5) {
  const perPageStr = localStorage.getItem(tablesRowsPerPageKey);
  if (!perPageStr) {
    return defaultRowsPerPage;
  }

  return parseInt(perPageStr);
}

function setTablesRowsPerPage(perPage: number) {
  localStorage.setItem(tablesRowsPerPageKey, perPage.toString());
}

/**
 * @returns the 'VERSION' of the app and the 'GIT_VERSION' of the app.
 */
function getVersion() {
  return {
    VERSION: import.meta.env.REACT_APP_HEADLAMP_VERSION,
    GIT_VERSION: import.meta.env.REACT_APP_HEADLAMP_GIT_VERSION,
  };
}

/**
 * @returns the product name of the app, or undefined if it's not set.
 */
function getProductName(): string | undefined {
  return import.meta.env.REACT_APP_HEADLAMP_PRODUCT_NAME;
}

export interface ClusterSettings {
  defaultNamespace?: string;
  allowedNamespaces?: string[];
  currentName?: string;
}

function storeClusterSettings(clusterName: string, settings: ClusterSettings) {
  if (!clusterName) {
    return;
  }
  localStorage.setItem(`cluster_settings.${clusterName}`, JSON.stringify(settings));
}

function loadClusterSettings(clusterName: string): ClusterSettings {
  if (!clusterName) {
    return {};
  }
  const settings = JSON.parse(localStorage.getItem(`cluster_settings.${clusterName}`) || '{}');
  return settings;
}

function storeTableSettings(tableId: string, columns: { id?: string; show: boolean }[]) {
  if (!tableId) {
    console.debug('storeTableSettings: tableId is empty!', new Error().stack);
    return;
  }

  const columnsWithIds = columns.map((c, i) => ({ id: i.toString(), ...c }));
  // Delete the entry if there are no settings to store.
  if (columnsWithIds.length === 0) {
    localStorage.removeItem(`table_settings.${tableId}`);
    return;
  }
  localStorage.setItem(`table_settings.${tableId}`, JSON.stringify(columnsWithIds));
}

function loadTableSettings(tableId: string): { id: string; show: boolean }[] {
  if (!tableId) {
    console.debug('loadTableSettings: tableId is empty!', new Error().stack);
    return [];
  }

  const settings = JSON.parse(localStorage.getItem(`table_settings.${tableId}`) || '[]');
  return settings;
}

/**
 * @returns true if the websocket multiplexer is enabled.
 * defaults to true. This is a feature flag to enable the websocket multiplexer.
 */
export function getWebsocketMultiplexerEnabled(): boolean {
  // TODO Reenable after #2805 and #2970 are fixed
  return import.meta.env.REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER === 'true';
}

/**
 * The backend token to use when making API calls from Headlamp when running as an app.
 * The token is requested from the main process via IPC once the renderer is ready,
 * and stored for use in the getHeadlampAPIHeaders function below.
 *
 * The app also sets HEADLAMP_BACKEND_TOKEN in the headlamp-server environment,
 * which the server checks to validate requests containing this same token.
 */
let backendToken: string | null = null;

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

const exportFunctions = {
  getBaseUrl,
  isDevMode,
  getAppUrl,
  isElectron,
  isDockerDesktop,
  getAppVersion,
  setAppVersion,
  setRecentCluster,
  getRecentClusters,
  getTablesRowsPerPage,
  setTablesRowsPerPage,
  getVersion,
  getProductName,
  storeClusterSettings,
  loadClusterSettings,
  getHeadlampAPIHeaders,
  getWebsocketMultiplexerEnabled,
  storeTableSettings,
  loadTableSettings,
};

export default exportFunctions;
