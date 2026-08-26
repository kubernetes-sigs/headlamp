# lib/k8s/api/v1/clusterApi

## Interfaces

| Interface | Description |
| ------ | ------ |
| [ClusterUserInfo](interfaces/ClusterUserInfo.md) | User info returned from SelfSubjectReview or derived from cluster config |

## Functions

| Function | Description |
| ------ | ------ |
| [deleteCluster](functions/deleteCluster.md) | deleteCluster sends call to backend remove a cluster from the config. |
| [getClusterDefaultNamespace](functions/getClusterDefaultNamespace.md) | getClusterDefaultNamespace gives the default namespace for the given cluster. |
| [getClusterUserInfo](functions/getClusterUserInfo.md) | Get user info for the given cluster using SelfSubjectReview API. Falls back to returning cluster name if the API is not available. Returns { username: 'unknown' } if no cluster is resolved. |
| [parseKubeConfig](functions/parseKubeConfig.md) | parseKubeConfig sends a kubeconfig to the backend to parse and returns the resulting clusters. |
| [renameCluster](functions/renameCluster.md) | renameCluster sends call to backend to update a field in kubeconfig which is the custom name of the cluster used by the user. |
| [setCluster](functions/setCluster.md) | - |
| [testAuth](functions/testAuth.md) | Test authentication for the given cluster. Will throw an error if the user is not authenticated. |
| [testClusterHealth](functions/testClusterHealth.md) | Checks cluster health Will throw an error if the cluster is not healthy. |
