# Function: streamResult()

```ts
function streamResult<T>(
   url: string, 
   name: string, 
   cb: StreamResultsCb<T>, 
   errCb: StreamErrCb, 
   queryParams?: QueryParameters, 
cluster?: string): Promise<() => void>;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:56](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v1/streamingApi.ts#L56)

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
| `queryParams?` | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) | The query parameters to include in the API request. |
| `cluster?` | `string` | - |

## Returns

`Promise`\<() => `void`\>

A function to cancel the stream.
