# lib/k8s/api/v1/clusterRequests

## Index

### Interfaces

| Interface | Description |
| ------ | ------ |
| [ClusterRequest](interfaces/ClusterRequest.md) | - |
| [ClusterRequestParams](interfaces/ClusterRequestParams.md) | The options for `clusterRequest`. |
| [RequestParams](interfaces/RequestParams.md) | Options for the request. |

### Functions

| Function | Description |
| ------ | ------ |
| [clusterRequest](functions/clusterRequest.md) | Sends a request to the backend. If the cluster is required in the params parameter, it will be used as a request to the respective Kubernetes server. |
| [getClusterAuthType](functions/getClusterAuthType.md) | - |
| [patch](functions/patch.md) | - |
| [post](functions/post.md) | - |
| [put](functions/put.md) | - |
| [remove](functions/remove.md) | - |
| [request](functions/request.md) | Sends a request to the backend. If the useCluster parameter is true (which it is, by default), it will be treated as a request to the Kubernetes server of the currently defined (in the URL) cluster. |
