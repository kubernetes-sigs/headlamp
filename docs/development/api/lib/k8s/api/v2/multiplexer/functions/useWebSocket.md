# Function: useWebSocket()

```ts
function useWebSocket<T>(options: object): void;
```

Defined in: [lib/k8s/api/v2/multiplexer.ts:414](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/multiplexer.ts#L414)

React hook for WebSocket subscription to Kubernetes resources

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` | Type of data expected from the WebSocket |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | \{ `cluster?`: `string`; `enabled?`: `boolean`; `onError?`: (`error`: `Error`) => `void`; `onMessage`: (`data`: `T`) => `void`; `url`: () => `string`; \} | Configuration options for the WebSocket connection |
| `options.cluster?` | `string` | The Kubernetes cluster ID to watch |
| `options.enabled?` | `boolean` | Whether the WebSocket connection should be active |
| `options.onError?` | (`error`: `Error`) => `void` | Callback function to handle connection errors |
| `options.onMessage` | (`data`: `T`) => `void` | Callback function to handle incoming messages |
| `options.url` | () => `string` | Function that returns the WebSocket URL to connect to |

## Returns

`void`
