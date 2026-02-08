# lib/k8s/api/v2/useKubeObjectList

## Index

### Interfaces

| Interface | Description |
| ------ | ------ |
| [ListResponse](interfaces/ListResponse.md) | Object representing a List of Kube object with information about which cluster and namespace it came from |

### Functions

| Function | Description |
| ------ | ------ |
| [getWebsocketMultiplexerEnabled](functions/getWebsocketMultiplexerEnabled.md) | - |
| [kubeObjectListQuery](functions/kubeObjectListQuery.md) | Query to list Kube objects from a cluster and namespace(optional) |
| [makeListRequests](functions/makeListRequests.md) | Creates multiple requests to list Kube objects Handles multiple clusters, namespaces and allowed namespaces |
| [useKubeObjectList](functions/useKubeObjectList.md) | Returns a combined list of Kubernetes objects and watches for changes from the clusters given. |
| [useWatchKubeObjectLists](functions/useWatchKubeObjectLists.md) | Accepts a list of lists to watch. Upon receiving update it will modify query data for list query |
