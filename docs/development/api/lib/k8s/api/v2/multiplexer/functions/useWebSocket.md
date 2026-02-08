# Function: useWebSocket()

```ts
function useWebSocket<T>(options: object): void
```

React hook for WebSocket subscription to Kubernetes resources

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` | Type of data expected from the WebSocket |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | `object` | Configuration options for the WebSocket connection |
| `options.cluster`? | `string` | The Kubernetes cluster ID to watch |
| `options.enabled`? | `boolean` | Whether the WebSocket connection should be active |
| `options.onError`? | (`error`: `Error`) => `void` | Callback function to handle connection errors |
| `options.onMessage` | (`data`: `T`) => `void` | Callback function to handle incoming messages |
| `options.url` | () => `string` | Function that returns the WebSocket URL to connect to |

## Returns

`void`

## Defined in

[src/lib/k8s/api/v2/multiplexer.ts:328](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v2/multiplexer.ts#L328)
