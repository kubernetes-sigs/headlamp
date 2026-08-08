# Function: connectStream()

```ts
function connectStream<T>(
   path: string, 
   cb: StreamResultsCb<T>, 
   onFail: () => void, 
   isJson: boolean, 
   additionalProtocols?: string[], 
cluster?: string): Promise<StreamConnection>;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:388](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L388)

Connects to a WebSocket stream at the specified path and returns an object
with a `close` function and a `socket` property. Sends messages to `cb` callback.

## Type Parameters

| Type Parameter |
| ------ |
| `T` |

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `path` | `string` | `undefined` | The path of the WebSocket stream to connect to. |
| `cb` | [`StreamResultsCb`](../type-aliases/StreamResultsCb.md)\<`T`\> | `undefined` | The function to call with each message received from the stream. |
| `onFail` | () => `void` | `undefined` | The function to call if the stream is closed unexpectedly. |
| `isJson` | `boolean` | `undefined` | Whether the messages should be parsed as JSON. |
| `additionalProtocols` | `string`[] | `[]` | An optional array of additional WebSocket protocols to use. |
| `cluster` | `string` | `''` | - |

## Returns

`Promise`\<[`StreamConnection`](../interfaces/StreamConnection.md)\>

A promise that resolves to an object with a `close` function and a `socket` property.
