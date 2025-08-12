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

import { addBackstageAuthHeaders } from './addBackstageAuthHeaders';
import { getBackstageToken, setupBackstageMessageReceiver } from './backstageMessageReceiver';
import { loadClusterSettings, storeClusterSettings } from './clusterSettings';
import { getBaseUrl } from './getBaseUrl';
import { getHeadlampAPIHeaders } from './getHeadlampAPIHeaders';
import { getProductName, getVersion } from './getProductInfo';
import { isBackstage } from './isBackstage';
import { isDevMode } from './isDevMode';
import { isDockerDesktop } from './isDockerDesktop';
import { isElectron } from './isElectron';
import { getRecentClusters, setRecentCluster } from './recentClusters';
import { getTablesRowsPerPage, setTablesRowsPerPage } from './tablesRowsPerPage';

const exportFunctions = {
  getBaseUrl,
  isDevMode,
  isElectron,
  isDockerDesktop,
  isBackstage,
  getBackstageToken,
  addBackstageAuthHeaders,
  setupBackstageMessageReceiver,
  setRecentCluster,
  getRecentClusters,
  getTablesRowsPerPage,
  setTablesRowsPerPage,
  getVersion,
  getProductName,
  storeClusterSettings,
  loadClusterSettings,
  getHeadlampAPIHeaders,
};

export default exportFunctions;
