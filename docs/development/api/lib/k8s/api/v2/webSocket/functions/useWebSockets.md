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

[src/lib/k8s/api/v2/webSocket.ts:140](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v2/webSocket.ts#L140)
