# Function: streamResults()

```ts
function streamResults<T>(
   url: string, 
   cb: StreamResultsCb<T>, 
   errCb: StreamErrCb, 
   queryParams: 
  | QueryParameters
| undefined): Promise<() => void>;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:121](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v1/streamingApi.ts#L121)

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
| `queryParams` | \| [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) \| `undefined` | The query parameters to include in the API request. |

## Returns

`Promise`\<() => `void`\>

A promise that resolves to a function which can be called to cancel the stream.
