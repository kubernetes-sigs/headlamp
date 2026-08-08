# Function: useWebSockets()

```ts
function useWebSockets<T>(url: object): void;
```

Defined in: [lib/k8s/api/v2/webSocket.ts:140](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/webSocket.ts#L140)

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
