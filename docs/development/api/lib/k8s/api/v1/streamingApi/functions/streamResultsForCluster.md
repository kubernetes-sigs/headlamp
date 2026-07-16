# Function: streamResultsForCluster()

```ts
function streamResultsForCluster(
   url: string, 
   params: StreamResultsParams, 
queryParams?: QueryParameters): Promise<() => void>;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:151](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L151)

Establishes a stream to the Kubernetes API for a specific cluster.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `url` | `string` | The Kubernetes API endpoint to stream from. |
| `params` | [`StreamResultsParams`](../interfaces/StreamResultsParams.md) | The callback functions and cluster information. |
| `queryParams?` | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) | Optional query parameters to append to the request. |

## Returns

`Promise`\<() => `void`\>

A promise that resolves to a function which can be called to cancel the stream.
