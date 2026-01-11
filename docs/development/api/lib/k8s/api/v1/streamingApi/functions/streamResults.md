# Function: streamResults()

```ts
function streamResults<T>(
   url: string, 
   cb: StreamResultsCb<T>, 
   errCb: StreamErrCb, 
queryParams: undefined | QueryParameters): Promise<() => void>
```

Streams the results of a Kubernetes API request.

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `url` | `string` | The URL of the Kubernetes API endpoint. |
| `cb` | [`StreamResultsCb`](../type-aliases/StreamResultsCb.md)\<`T`\> | The callback function to execute when the stream receives data. |
| `errCb` | [`StreamErrCb`](../type-aliases/StreamErrCb.md) | The callback function to execute when an error occurs. |
| `queryParams` | `undefined` \| [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) | The query parameters to include in the API request. |

## Returns

`Promise`\<() => `void`\>

A function to cancel the stream.

## Defined in

[src/lib/k8s/api/v1/streamingApi.ts:121](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L121)
