# Function: clusterRequest()

```ts
function clusterRequest(
   path: string, 
   params?: ClusterRequestParams, 
queryParams?: QueryParameters): Promise<any>;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:123](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L123)

Sends a request to the backend. If the cluster is required in the params parameter, it will
be used as a request to the respective Kubernetes server.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `path` | `string` | The path to the API endpoint. |
| `params` | [`ClusterRequestParams`](../interfaces/ClusterRequestParams.md) | Optional parameters for the request. |
| `queryParams?` | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) | Optional query parameters for the k8s request. |

## Returns

`Promise`\<`any`\>

A Promise that resolves to the JSON response from the API server.

## Throws

An ApiError if the response status is not ok.
