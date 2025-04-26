import { loadClusterSettings, storeClusterSettings } from './clusterSettings';
import { getBaseUrl } from './getBaseUrl';
import { getHeadlampAPIHeaders } from './getHeadlampAPIHeaders';
import { getProductName, getVersion } from './getProductInfo';
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
