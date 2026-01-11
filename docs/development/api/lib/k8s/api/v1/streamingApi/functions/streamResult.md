# Function: streamResult()

```ts
function streamResult<T>(
   url: string, 
   name: string, 
   cb: StreamResultsCb<T>, 
   errCb: StreamErrCb, 
   queryParams?: QueryParameters, 
cluster?: string): Promise<() => void>
```

Fetches the data and watches for changes to the data.

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `url` | `string` | The URL of the Kubernetes API endpoint. |
| `name` | `string` | The name of the Kubernetes API resource. |
| `cb` | [`StreamResultsCb`](../type-aliases/StreamResultsCb.md)\<`T`\> | The callback function to execute when the stream receives data. |
| `errCb` | [`StreamErrCb`](../type-aliases/StreamErrCb.md) | The callback function to execute when an error occurs. |
| `queryParams`? | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) | The query parameters to include in the API request. |
| `cluster`? | `string` | - |

## Returns

`Promise`\<() => `void`\>

A function to cancel the stream.

## Defined in

[src/lib/k8s/api/v1/streamingApi.ts:56](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L56)
