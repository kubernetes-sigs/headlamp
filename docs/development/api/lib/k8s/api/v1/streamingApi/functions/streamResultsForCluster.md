# Function: streamResultsForCluster()

```ts
function streamResultsForCluster(
   url: string, 
   params: StreamResultsParams, 
queryParams?: QueryParameters): Promise<() => void>;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:151](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v1/streamingApi.ts#L151)

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
