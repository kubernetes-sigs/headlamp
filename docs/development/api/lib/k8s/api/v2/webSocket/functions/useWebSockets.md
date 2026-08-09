# Function: useWebSockets()

```ts
function useWebSockets<T>(url: object): void;
```

Defined in: [lib/k8s/api/v2/webSocket.ts:148](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v2/webSocket.ts#L148)

Creates or joins mutiple existing WebSocket connections

## Type Parameters

| Type Parameter |
| ------ |
| `T` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `url` | \{ `connections`: [`WebSocketConnectionRequest`](../type-aliases/WebSocketConnectionRequest.md)\<`T`\>[]; `enabled?`: `boolean`; `protocols?`: `string` \| `string`[]; `type?`: `"json"` \| `"binary"`; \} | endpoint URL |
| `url.connections` | [`WebSocketConnectionRequest`](../type-aliases/WebSocketConnectionRequest.md)\<`T`\>[] | Make sure that connections value is stable between renders |
| `url.enabled?` | `boolean` | - |
| `url.protocols?` | `string` \| `string`[] | Any additional protocols to include in WebSocket connection make sure that the value is stable between renders |
| `url.type?` | `"json"` \| `"binary"` | Type of websocket data |

## Returns

`void`
