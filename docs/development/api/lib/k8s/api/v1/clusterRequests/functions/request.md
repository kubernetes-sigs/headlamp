# Function: request()

```ts
function request(
   path: string, 
   params: RequestParams, 
   autoLogoutOnAuthError: boolean, 
   useCluster: boolean, 
queryParams?: QueryParameters): Promise<any>
```

Sends a request to the backend. If the useCluster parameter is true (which it is, by default), it will be
treated as a request to the Kubernetes server of the currently defined (in the URL) cluster.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `path` | `string` | `undefined` | The path to the API endpoint. |
| `params` | [`RequestParams`](../interfaces/RequestParams.md) | `{}` | Optional parameters for the request. |
| `autoLogoutOnAuthError` | `boolean` | `true` | Whether to automatically log out the user if there is an authentication error. |
| `useCluster` | `boolean` | `true` | Whether to use the current cluster for the request. |
| `queryParams`? | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) | `undefined` | Optional query parameters for the request. |

## Returns

`Promise`\<`any`\>

A Promise that resolves to the JSON response from the API server.

## Throws

An ApiError if the response status is not ok.

## Defined in

[src/lib/k8s/api/v1/clusterRequests.ts:94](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L94)
