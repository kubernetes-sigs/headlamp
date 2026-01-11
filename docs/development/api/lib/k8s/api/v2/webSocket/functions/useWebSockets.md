# Function: useWebSockets()

```ts
function useWebSockets<T>(__namedParameters: object): void
```

Creates or joins mutiple existing WebSocket connections

## Type Parameters

| Type Parameter |
| ------ |
| `T` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `__namedParameters` | `object` | - |
| `__namedParameters.connections` | [`WebSocketConnectionRequest`](../type-aliases/WebSocketConnectionRequest.md)\<`T`\>[] | Make sure that connections value is stable between renders |
| `__namedParameters.enabled`? | `boolean` | - |
| `__namedParameters.protocols`? | `string` \| `string`[] | Any additional protocols to include in WebSocket connection make sure that the value is stable between renders |
| `__namedParameters.type`? | `"json"` \| `"binary"` | Type of websocket data |

## Returns

`void`

## Defined in

[src/lib/k8s/api/v2/webSocket.ts:140](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/webSocket.ts#L140)
